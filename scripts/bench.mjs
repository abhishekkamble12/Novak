#!/usr/bin/env node
/**
 * Load test for a running Novak stack. No dependencies (Node 20+ fetch).
 *
 *   node scripts/bench.mjs [--base http://localhost:3000/api] [--posts 300] [--concurrency 10]
 *                          [--requests 500] [--out docs/benchmarks/results.json]
 *
 * Start the API with RATE_LIMIT_ENABLED=false and, for a clean run, a fresh MONGO_DB_NAME.
 * Phases:
 *   1. create   POST /posts            (--posts requests across 10 users, at --concurrency)
 *   2. drain    time until every post's analysis completes (worker + AI service + Qdrant)
 *   3. feed     GET /posts/feed        first page and pages reached by cursor
 *   4. search   GET /search            hybrid semantic + keyword
 * Reports p50/p95/p99 latency, throughput, error rate, and API process RSS / CPU.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), [])
);
const BASE = args.base ?? "http://localhost:3000/api";
const POSTS = Number(args.posts ?? 300);
const CONCURRENCY = Number(args.concurrency ?? 10);
const REQUESTS = Number(args.requests ?? 500);
const OUT = args.out;

const CAPTIONS = [
  "Golden hour on the beach, waves rolling in",
  "Oat milk flat white and a quiet corner",
  "Summit reached after six hours of switchbacks",
  "Neon signs reflecting in puddles downtown",
  "New deadlift PR at the gym today",
  "Rainy day, blanket, and a stack of library books",
  "Homemade ramen, broth simmered for twelve hours",
  "My monstera finally unfurled a new leaf",
  "Fresh powder, first ski run of the season",
  "Sixty miles on the bike, legs are toast",
  "Telescope pointed at Saturn tonight",
  "Chocolate lava cake for dessert",
];
const QUERIES = [
  "caffeine fix",
  "ocean waves at dusk",
  "climbing a mountain",
  "weightlifting",
  "houseplants",
  "noodle soup",
  "stargazing",
  "cycling",
  "winter sports",
  "reading a novel",
];

async function call(method, url, { token, body } = {}) {
  const started = performance.now();
  try {
    const res = await fetch(BASE + url, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, ms: performance.now() - started, json };
  } catch (err) {
    return { ok: false, status: 0, ms: performance.now() - started, error: err.message };
  }
}

async function load(name, total, concurrency, makeRequest) {
  const samples = [];
  let next = 0;
  const live0 = await liveStats();
  const started = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < total) {
        const i = next++;
        samples.push(await makeRequest(i));
      }
    })
  );
  const wallMs = performance.now() - started;
  const live1 = await liveStats();
  const ms = samples.map((s) => s.ms).sort((a, b) => a - b);
  const pct = (p) => ms[Math.min(ms.length - 1, Math.floor((p / 100) * ms.length))];
  const errors = samples.filter((s) => !s.ok);
  const result = {
    name,
    requests: total,
    concurrency,
    p50_ms: round(pct(50)),
    p95_ms: round(pct(95)),
    p99_ms: round(pct(99)),
    mean_ms: round(ms.reduce((a, b) => a + b, 0) / ms.length),
    throughput_rps: round((total / wallMs) * 1000),
    error_rate: round(errors.length / total, 4),
    error_statuses: [...new Set(errors.map((e) => e.status))],
    api_cpu_percent_of_one_core:
      live0 && live1 ? round(((live1.cpuMicros - live0.cpuMicros) / 1000 / wallMs) * 100) : null,
    api_rss_mb_after: live1 ? round(live1.rssBytes / 1048576) : null,
  };
  console.log(
    `${name.padEnd(28)} n=${total} c=${concurrency}  p50 ${result.p50_ms}ms  p95 ${result.p95_ms}ms  ` +
      `p99 ${result.p99_ms}ms  ${result.throughput_rps} req/s  errors ${(result.error_rate * 100).toFixed(1)}%`
  );
  return { result, samples };
}

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const liveStats = async () => (await call("GET", "/health/live")).json?.data;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const health = await call("GET", "/health");
  if (!health.json) throw new Error(`API not reachable at ${BASE}`);
  console.log(`API health: ${health.json.data.status}`);

  const run = `b${Date.now().toString(36)}`;
  const users = [];
  for (let i = 0; i < 10; i++) {
    const username = `${run}_${i}`;
    const res = await call("POST", "/auth/register", {
      body: { username, email: `${username}@bench.dev`, password: "Passw0rd!", name: username },
    });
    if (!res.ok) throw new Error(`register failed (${res.status}); is RATE_LIMIT_ENABLED=false?`);
    users.push(res.json.data.accessToken);
  }

  const phases = [];
  const created = await load("POST /posts", POSTS, CONCURRENCY, (i) =>
    call("POST", "/posts", {
      token: users[i % users.length],
      body: {
        caption: `${CAPTIONS[i % CAPTIONS.length]} #${run}`,
        mediaUrl: "https://example.com/bench.jpg",
      },
    })
  );
  phases.push(created.result);

  // Drain: poll the pipeline backlog until no post is pending
  const drainStart = performance.now();
  let pending = null;
  for (let i = 0; i < 600; i++) {
    pending = (await call("GET", "/health")).json?.data?.pipeline?.pendingPosts;
    if (pending === 0) break;
    await sleep(500);
  }
  const drainMs = performance.now() - drainStart;
  const drain = {
    name: "analysis drain",
    posts: POSTS,
    seconds_after_last_create: round(drainMs / 1000),
    posts_per_second:
      pending === 0
        ? round(POSTS / (created.result.requests / created.result.throughput_rps + drainMs / 1000))
        : null,
    completed: pending === 0,
  };
  console.log(
    `analysis drain               ${drain.completed ? "done" : "NOT DONE"} ${drain.seconds_after_last_create}s after the last create`
  );
  phases.push(drain);

  phases.push(
    (await load("GET /posts/feed (anon)", REQUESTS, CONCURRENCY, () => call("GET", "/posts/feed?limit=20")))
      .result
  );
  phases.push(
    (
      await load("GET /posts/feed (signed in)", REQUESTS, CONCURRENCY, (i) =>
        call("GET", "/posts/feed?limit=20", { token: users[i % users.length] })
      )
    ).result
  );

  // Deep pages: walk the cursor once, then fetch those pages repeatedly
  const cursors = [];
  let cursor;
  for (let i = 0; i < 10; i++) {
    const page = await call("GET", `/posts/feed?limit=20${cursor ? `&cursor=${cursor}` : ""}`);
    cursor = page.json?.meta?.cursor;
    if (!cursor) break;
    cursors.push(cursor);
  }
  phases.push(
    (
      await load("GET /posts/feed (by cursor)", REQUESTS, CONCURRENCY, (i) =>
        call("GET", `/posts/feed?limit=20&cursor=${cursors[i % cursors.length]}`)
      )
    ).result
  );

  const search = await load("GET /search (hybrid)", REQUESTS, CONCURRENCY, (i) =>
    call("GET", `/search?q=${encodeURIComponent(QUERIES[i % QUERIES.length])}`)
  );
  const modes = search.samples.reduce(
    (acc, s) => ((acc[s.json?.data?.mode ?? "error"] = (acc[s.json?.data?.mode ?? "error"] ?? 0) + 1), acc),
    {}
  );
  phases.push({ ...search.result, modes });
  console.log(`  search modes: ${JSON.stringify(modes)}`);

  const finalHealth = (await call("GET", "/health")).json?.data;
  const report = {
    date: new Date().toISOString(),
    environment: {
      os: `${os.type()} ${os.release()}`,
      cpu: os.cpus()[0]?.model,
      cores: os.cpus().length,
      memory_gb: round(os.totalmem() / 1073741824, 1),
      node: process.version,
      note: "Client, API, AI service, MongoDB, Redis and Qdrant all on this one machine",
    },
    parameters: {
      base: BASE,
      posts: POSTS,
      concurrency: CONCURRENCY,
      requests_per_read_phase: REQUESTS,
      users: 10,
    },
    phases,
    pipeline_after: finalHealth?.pipeline,
  };
  if (OUT) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
    console.log(`wrote ${OUT}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
