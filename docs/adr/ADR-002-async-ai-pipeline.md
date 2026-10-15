# ADR-002: Asynchronous AI Pipeline via BullMQ & Redis

## Status
Accepted

## Date
2026-10-15

## Context
When a user uploads a photo and publishes a post:
- Deep neural network inference (CLIP embedding extraction, multi-label classification, toxicity/NSFW evaluation) takes between 150ms to 800ms depending on hardware.
- Blocking the HTTP response `POST /api/posts` for ML inference degrades client UX, increases p99 latency, and creates thread/socket starvation under traffic bursts.

## Decision
We decouple post creation from AI processing using an asynchronous message queue:
1. `POST /api/posts` immediately writes the post record to MongoDB with `moderationStatus: 'pending'` and returns `201 Created` with post metadata in <50ms.
2. The API enqueues a background job (`post-analysis`) into BullMQ backed by Redis.
3. BullMQ workers deliver the job payload to the Python AI service or worker consumers.
4. The AI service computes the 512-dimensional CLIP embedding, runs moderation guardrails, and indexes the vector into Qdrant.
5. Upon completion, MongoDB is updated and a WebSocket event (`post:processed`) is emitted to the author client.

## Consequences
### Positive
- Ultra-low user-perceived write latency (<50ms).
- Graceful degradation: If the AI service experiences temporary backlog or restart, posts remain durable in MongoDB and queue safely in Redis.
- Horizontal scalability of CPU/GPU worker pools independently of the web API.

### Negative
- Eventual consistency: Feed queries must handle posts with `moderationStatus: 'pending'`.
