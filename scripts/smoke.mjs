#!/usr/bin/env node
/**
 * End-to-end smoke test of the core journey against a running stack (no dependencies):
 * register -> publish -> background analysis completes -> post is found by a paraphrase
 * query -> flagged caption is hidden from other users -> like -> delete.
 *
 *   node scripts/smoke.mjs [--base http://localhost:3000/api] [--web http://localhost]
 *
 * With Docker Compose, --web is the nginx gateway (http://localhost), which serves the SPA and
 * proxies /api and /socket.io. In local dev it's the Vite server (http://localhost:5173).
 */
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), [])
);
const BASE = args.base ?? "http://localhost:3000/api";
const WEB = args.web;

async function call(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

function check(cond, message) {
  if (!cond) throw new Error(`FAIL: ${message}`);
  console.log(`ok   ${message}`);
}

async function waitFor(fn, what, timeoutMs = 120_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`FAIL: timed out waiting for ${what}`);
}

async function register(name) {
  const username = `${name}_${Date.now().toString(36)}`;
  const res = await call("POST", "/auth/register", {
    body: { username, email: `${username}@smoke.dev`, password: "Passw0rd!", name },
  });
  check(res.status === 201, `register ${name}`);
  return res.body.data.accessToken;
}

async function main() {
  await waitFor(async () => (await call("GET", "/health").catch(() => ({}))).status === 200, "API health 200");
  check(true, "API healthy (MongoDB + Redis)");
  if (WEB) {
    const html = await fetch(WEB).then((r) => r.text());
    check(html.includes('<div id="root">'), "web app serves the SPA");
    // The SPA calls /api on its own origin; that must reach the API, not the static host
    const viaWeb = await fetch(`${WEB}/api/health`);
    check(
      (viaWeb.headers.get("content-type") ?? "").includes("application/json"),
      "web origin routes /api to the API"
    );
  }

  const alice = await register("alice");
  const bob = await register("bob");
  const marker = Date.now().toString(36);

  const created = await call("POST", "/posts", {
    token: alice,
    body: { caption: "Spent the afternoon sketching strangers in the park", mediaUrl: "https://example.com/a.jpg" },
  });
  check(created.status === 201 && created.body.data.processingStatus === "pending", "publish returns 201, pending");
  const postId = created.body.data.id;

  const done = await waitFor(async () => {
    const p = (await call("GET", `/posts/${postId}`, { token: alice })).body?.data;
    return p?.processingStatus === "completed" ? p : null;
  }, "analysis to complete");
  check(done.searchIndexed === true && done.moderationStatus === "approved", "analysis completed and indexed");

  // No word in common with the caption: only the embedding can find it
  const search = await call("GET", "/search?q=drawing%20people", { token: bob });
  check(search.body.data.mode === "hybrid", "search ran in hybrid mode (AI service up)");
  const hit = search.body.data.results.find((p) => p.id === postId);
  check(hit && typeof hit.score === "number", `paraphrase query found the post (score ${hit?.score})`);

  const spam = await call("POST", "/posts", {
    token: alice,
    body: { caption: `Free crypto for everyone ${marker}`, mediaUrl: "https://example.com/b.jpg" },
  });
  const spamId = spam.body.data.id;
  await waitFor(async () => (await call("GET", `/posts/${spamId}`, { token: alice })).body?.data?.processingStatus === "completed", "spam analysis");
  check((await call("GET", `/posts/${spamId}`, { token: alice })).body.data.moderationStatus === "flagged", "spam caption flagged");
  check((await call("GET", `/posts/${spamId}`, { token: bob })).status === 404, "flagged post hidden from other users");

  const liked = await call("POST", `/posts/${postId}/like`, { token: bob });
  check(liked.body.data.likesCount === 1, "like counted");
  check((await call("DELETE", `/posts/${postId}`, { token: bob })).status === 403, "non-author cannot delete");
  check((await call("DELETE", `/posts/${postId}`, { token: alice })).status === 200, "author deletes post");
  const after = await call("GET", "/search?q=drawing%20people", { token: bob });
  check(!after.body.data.results.some((p) => p.id === postId), "deleted post no longer in search");

  console.log("\nsmoke test passed");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
