# Benchmarks

Measured with `scripts/bench.mjs` (no dependencies). Raw output:
[`benchmarks/results.json`](benchmarks/results.json) (concurrency 10) and
[`benchmarks/results-c1.json`](benchmarks/results-c1.json) (concurrency 1).

## Environment

| | |
|---|---|
| Machine | Laptop, AMD Ryzen 5 5600H (6 cores / 12 threads), 15.4 GB RAM, Windows 11 |
| Runtime | Node v22.16.0, API compiled (`node dist/server.js`), `NODE_ENV=production`, JSON request logging on |
| Services | MongoDB 7.0, Redis 7.2, Qdrant 1.19 in Docker Desktop; AI service via uvicorn (1 process, CPU) |
| Topology | **Everything on one machine**, including the load generator. The worker runs inside the API process (concurrency 2), and the embedding model shares the CPU with the API |
| Rate limiting | Disabled (`RATE_LIMIT_ENABLED=false`) so the per-IP limit doesn't cap the test |
| Date | 2026-10-20 |

## Method

1. Register 10 users.
2. **create**: `POST /api/posts` with captions from a fixed list (12 topics), spread across the users.
3. **drain**: poll `/api/health` until `pipeline.pendingPosts` is 0, meaning every post went through
   BullMQ → AI service (screen, embed, tag) → Qdrant upsert → MongoDB.
4. **feed**: `GET /api/posts/feed?limit=20` anonymously, signed in (the `$or` visibility filter),
   and at cursor positions up to 10 pages deep.
5. **search**: `GET /api/search` cycling through 10 queries (hybrid: AI service + Qdrant + `$text`).

Run 1 used a fresh database (300 posts created at concurrency 10). Run 2 ran right after, on the
same database (100 more posts, concurrency 1). Latency is measured by the client and includes
loopback HTTP.

```bash
# API: RATE_LIMIT_ENABLED=false MONGO_DB_NAME=novak_bench node dist/server.js
node scripts/bench.mjs --posts 300 --concurrency 10 --requests 500 --out docs/benchmarks/results.json
node scripts/bench.mjs --posts 100 --concurrency 1  --requests 200 --out docs/benchmarks/results-c1.json
```

## Results

### Concurrency 1 (unloaded latency)

| Endpoint | Requests | p50 ms | p95 ms | p99 ms | req/s | Errors |
|---|---|---|---|---|---|---|
| POST /posts | 100 | 28.4 | 35.5 | 40.5 | 34.9 | 0% |
| GET /posts/feed (anonymous) | 200 | 6.3 | 7.9 | 9.0 | 155.0 | 0% |
| GET /posts/feed (signed in) | 200 | 9.7 | 17.7 | 21.3 | 93.5 | 0% |
| GET /posts/feed (by cursor) | 200 | 8.9 | 13.1 | 16.1 | 109.9 | 0% |
| GET /search (hybrid) | 200 | 34.7 | 54.5 | 85.7 | 27.0 | 0% |

Analysis kept pace: the last of the 100 posts finished 0.5 s after it was created.

### Concurrency 10

| Endpoint | Requests | p50 ms | p95 ms | p99 ms | req/s | Errors | API CPU* | API RSS |
|---|---|---|---|---|---|---|---|---|
| POST /posts | 300 | 196.5 | 353.6 | 474.2 | 46.5 | 0% | 110% | 117 MB |
| GET /posts/feed (anonymous) | 500 | 51.7 | 65.6 | 71.8 | 189.0 | 0% | 149% | 130 MB |
| GET /posts/feed (signed in) | 500 | 68.0 | 105.7 | 138.8 | 139.0 | 0% | 115% | 179 MB |
| GET /posts/feed (by cursor) | 500 | 49.6 | 61.8 | 65.1 | 200.0 | 0% | 127% | 204 MB |
| GET /search (hybrid) | 500 | 171.6 | 248.8 | 370.6 | 58.2 | 0% | 82% | 212 MB |

\* CPU time of the API process divided by wall time; it can exceed 100% because libuv and GC
threads run in parallel with the event loop.

**Pipeline throughput:** all 300 posts were analysed and indexed 7.9 s after the last create
returned, about 21 posts/s end to end with worker concurrency 2. Search ran in hybrid mode for
all 500 requests (the AI service never fell back).

## Reading the numbers

- **The API is CPU-bound in one process.** At concurrency 10, feed latency is mostly queueing:
  6 ms of work per request becomes a 50 ms wait, at roughly 190 req/s. Query plans show MongoDB
  isn't the bottleneck (below).
- **Create is the most expensive write** (about 5 round trips: insert, counter update, Redis
  enqueue, then re-reading the post with its author). At concurrency 10 it also competed for
  CPU with the embedding model, which was working on the same posts. The earlier README claim
  of "<50 ms p95" was never measured; it is wrong under load and has been removed.
- **Search** costs an HTTP hop to the AI service, a query embedding (~6–9 ms on CPU), a Qdrant
  query, a `$text` query and a hydration query. At concurrency 10 the single uvicorn process
  embedding queries is the limit.
- What would help first: run the worker in its own process, run more uvicorn workers, and have
  `POST /posts` build its response from the inserted document instead of re-reading it.

These numbers come from one laptop and a few hundred posts. They show how the code behaves,
not what a deployment would sustain.

## Query plans (MongoDB 7, 400 posts)

`cd apps/api && npx tsx scripts/explain-queries.ts` runs `explain("executionStats")` on the exact
filters the API builds:

| Query | Winning plan | Returned | Keys examined | Docs examined |
|---|---|---|---|---|
| Feed, anonymous (`moderationStatus ∈ {approved, pending}`, sort `createdAt,_id`) | `SORT_MERGE` of two `IXSCAN(moderationStatus_1_createdAt_-1__id_-1)` | 21 | 21 | 21 |
| Feed, signed in (`$or`: public statuses, or own non-rejected posts) | `SUBPLAN` → `SORT_MERGE` of `IXSCAN(author_1_createdAt_-1__id_-1)` + 2× status index | 21 | 22 | 22 |
| Profile grid | `IXSCAN(author_1_createdAt_-1__id_-1)` | 21 | 21 | 21 |
| Reconciler scan | `IXSCAN(pending_processing)` (partial index) | 0 | 0 | 0 |

No query sorts in memory, and keys/docs examined ≈ documents returned, so feed cost doesn't grow
with collection size. `SORT_MERGE` works because each `$in` value and each `$or` branch is an index
range already ordered by `(createdAt, _id)`.
