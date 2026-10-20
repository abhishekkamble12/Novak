# ADR-003: Reconcile from MongoDB instead of a transactional outbox

## Status
Accepted (2026-10-20)

## Context
The post is written to MongoDB and the job to Redis: two systems, no shared transaction.
Observed failure modes before this change:
- Redis down at publish time: the enqueue hung for the whole outage, then was lost.
- Retries exhausted: the post stayed "AI analyzing" forever.
- Qdrant down: the AI service returned 200 with `indexed: false`, the post was marked done,
  and it never became searchable.

## Options
1. **Transactional outbox**: write an outbox row in the same MongoDB transaction as the post
   and have a relay move rows to Redis. Requires a replica set for transactions, an outbox
   collection and a relay process.
2. **Reconciler**: treat `posts.processingStatus` as the outbox. A periodic pass finds posts
   still `pending` after a grace period and compares them with BullMQ's view of the job.

## Decision
Option 2. The post document already records whether work is outstanding, so a separate
outbox would duplicate it. Every 60 s (configurable) the worker process runs:

| BullMQ job state for a pending post | Action |
|---|---|
| missing (enqueue failed, Redis data lost) | enqueue again |
| failed (terminal failure write was lost) | mark the post `failed` |
| completed (stale leftover) | replace the job and run again |
| waiting / delayed / active | leave it; BullMQ re-queues stalled active jobs |

It's safe because every step is idempotent: `jobId = postId` deduplicates enqueues, the
Qdrant point id is derived from the post id, and the MongoDB completion write only applies
while the post isn't `completed` yet. Running several API instances (each with a reconciler)
is therefore harmless.

The scan uses a partial index (`createdAt` where `processingStatus = "pending"`), so its cost
depends on the backlog size, not on the number of posts.

## Consequences
- Recovery latency is up to `RECONCILE_STALE_MS + RECONCILE_INTERVAL_MS` (about 2 min by
  default) after Redis comes back.
- Terminal failures (`failed`) are not retried automatically; the author can retry
  (`POST /api/posts/:id/reprocess`). A failure is never recorded as moderation approval.
- At larger scale I'd move the worker and reconciler out of the API process and give the
  reconciler a leader lock, mainly to avoid N instances scanning the same rows.
