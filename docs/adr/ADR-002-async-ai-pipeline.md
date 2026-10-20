# ADR-002: Asynchronous AI Pipeline via BullMQ & Redis

## Status
Accepted (amended 2026-10-20: processing states, reconciler, measured latency; see ADR-003)

## Context
Publishing a post triggers caption screening, embedding (bge-small, ~5-10 ms of CPU per caption
on a laptop), tagging and a Qdrant upsert. Doing this inside `POST /api/posts` would couple
posting to the AI service and Qdrant: if either is slow or down, nobody can post.

## Decision
1. `POST /api/posts` writes the post to MongoDB (`processingStatus: "pending"`) and returns 201.
2. It then enqueues a `post-analysis` BullMQ job keyed by the post id. The enqueue fails fast
   (2 s cap, no offline queue) if Redis is down; the post is already durable.
3. A worker calls the AI service, which screens and embeds the caption and upserts the vector.
4. The worker writes the result to MongoDB (`processingStatus: "completed"`) and emits a
   `post:processed` Socket.IO event to the author.

## Consequences
### Positive
- Posting keeps working when the AI service, Qdrant or Redis is down (verified by
  `test/integration/redisDown.int.test.ts` and manual outage tests).
- Measured `POST /api/posts` latency: p50 28 ms unloaded, p50 197 ms at 10 concurrent clients
  with analysis running on the same laptop (docs/BENCHMARKS.md). The earlier "<50 ms" figure
  was never measured and has been removed.

### Negative
- Eventual consistency: a post is visible before its caption is screened (optimistic
  publishing) and becomes searchable a few seconds later.
- Redis is not the source of truth, so a reconciler is needed to recover lost jobs (ADR-003).
