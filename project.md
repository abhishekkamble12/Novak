Lumen: AI-Native Social Platform (MERN + Python)
Project Design Document | Target: Full-Stack / SDE roles | Author: Abhishek
1. Overview
Lumen is an Instagram-style social platform where AI is part of the core architecture, not a bolt-on. The Node.js backend owns the product domain (auth, posts, feed, chat, notifications). A separate Python FastAPI service owns the ML workloads (captioning, moderation, semantic search, ranking, RAG). The two communicate asynchronously through a Redis-backed queue.
One-line pitch: A distributed social platform with CLIP-based semantic image search, an async AI pipeline, and an embedding-based feed ranker, benchmarked with real latency and quality numbers.
1.1 Goals
• Demonstrate full-stack depth: React, Node, MongoDB, Redis, WebSockets.
• Demonstrate system design: feed fan-out, caching, async pipelines, service boundaries.
• Demonstrate applied AI engineering: embeddings, vector search, moderation, ranking, RAG, with evaluation, not just API calls.
• Produce measurable results (p95 latency, cache hit rate, retrieval precision) usable as resume bullets.
• Ship it: deployed, CI-tested, documented.
1.2 Non-Goals
• Video/Reels processing, live streaming, shopping, ads.
• Pixel-perfect Instagram UI.
• Training models from scratch. Use pretrained models and focus on integration and evaluation.
1.3 Why this is not "just another clone"
A clone shows CRUD. Lumen shows tradeoffs: fan-out strategy, cache invalidation, queue semantics (retries, idempotency, DLQ), embedding drift, ranking evaluation. Every one of those is an interview question you can answer from your own code.
2. Tech Stack
Layer
Choice
Reason
Frontend
React 18 + Vite, TypeScript, React Query, Zustand/Redux Toolkit, Tailwind, Socket.IO client
Fast dev, server-state caching, typed contracts
Core API
Node 20, Express, TypeScript, Mongoose, Zod
Familiar MERN core, schema validation at the edge
Database
MongoDB (Atlas)
Flexible documents for posts/comments, TTL indexes for stories
Cache / Queue
Redis, BullMQ
Feed cache, rate limiting, presence, job queue
Real-time
Socket.IO with Redis adapter
Horizontal scaling of WebSocket nodes
AI service
Python 3.11, FastAPI, Pydantic, worker processes (BullMQ-compatible consumer or Celery)
Python ML ecosystem
Models
CLIP (open_clip / sentence-transformers), HuggingFace toxicity + NSFW classifiers, a vision-capable LLM API for captions, text embedding model for RAG
Mix of local and hosted models
Vector store
Qdrant (preferred) or pgvector / FAISS for MVP
Filtering + ANN search
Media
Cloudinary or S3 + CloudFront
Offload image storage and resizing
Infra
Docker Compose (dev), Nginx, GitHub Actions, deploy on AWS EC2/ECS or Render + Atlas
Reproducible environments
Observability
pino logs, Prometheus + Grafana, OpenTelemetry (optional)
Latency and queue metrics
Testing
Jest + Supertest, Vitest/RTL, pytest, Playwright (1-2 e2e flows), k6
Test pyramid + load test
3. System Architecture
                 +-------------------+
  Browser  --->  |  Nginx / CDN      |
  (React SPA)    +---------+---------+
                           |
          +----------------+-----------------+
          |                                  |
   REST /api/*                        WebSocket /socket.io
          |                                  |
   +------v----------------------------------v------+
   |            Node.js Core API (Express)           |
   |  auth | users | posts | feed | chat | notifs   |
   +---+-----------+-------------+-------------+-----+
       |           |             |             |
   MongoDB       Redis        Cloudinary/S3   BullMQ queues
  (primary)  (cache, rate,                       |
             presence, pubsub)                   |
                                   +-------------v-------------+
                                   |  Python AI Service        |
                                   |  FastAPI (sync endpoints) |
                                   |  + Workers (async jobs)   |
                                   +------+------------+-------+
                                          |            |
                                      Qdrant       Model runtime
                                   (vectors)    (CLIP, classifiers, LLM API)
3.1 Service boundaries
• Node Core API is the system of record. It never loads ML models.
• AI Service is stateless apart from the vector store. It never writes directly to Mongo domain collections; it returns results via queue events or a callback endpoint, and Node persists them.
• Why async: model inference takes 200ms to several seconds. Blocking the upload request would hurt p95 and tie up Node workers. The queue gives backpressure, retries, and independent scaling.
3.2 Upload-to-AI flow (canonical sequence)
1. Client uploads image(s) via signed URL to Cloudinary/S3.
2. Client calls POST /api/posts with media URLs and caption.
3. Node validates, saves the post with status: "pending_moderation", returns 201 immediately.
4. Node enqueues post.created job {postId, mediaUrls, authorId, idempotencyKey}.
5. AI worker runs: NSFW check, then embedding generation, then caption/hashtag suggestions.
6. Worker pushes result: embeddings to Qdrant, and a post.analyzed event to the result queue.
7. Node consumes the result: updates the post (status: "published" or "flagged"), stores suggestions, emits a Socket.IO event to the author.
8. Published posts trigger feed fan-out.
4. Data Model (MongoDB)
4.1 Collections
users
{ _id, username (unique), email (unique), passwordHash, avatarUrl, bio,
  followersCount, followingCount, postsCount, roles: ["user"|"admin"],
  emailVerified, createdAt }
Indexes: username, email, text index on username/bio.
follows
{ _id, followerId, followeeId, createdAt }
Indexes: unique (followerId, followeeId), (followeeId, createdAt).
posts
{ _id, authorId, media: [{url, width, height, blurhash}], caption, hashtags: [],
  aiCaption, aiHashtags, likesCount, commentsCount, status, moderation: {nsfwScore,
  toxicityScore, flags: []}, embeddingVersion, createdAt }
Indexes: (authorId, createdAt desc), hashtags, (status, createdAt).
comments
{ _id, postId, authorId, parentId|null, body, likesCount, toxicityScore, createdAt }
Indexes: (postId, parentId, createdAt). Two-level nesting only (top-level + replies) to keep queries bounded.
likes: { userId, targetType, targetId, createdAt } with unique (userId, targetType, targetId).
feed_items (fan-out on write, capped per user)
{ userId, postId, authorId, score, createdAt }
Index: (userId, createdAt desc). Cap at roughly 500 items per user via trimming job.
stories: { authorId, mediaUrl, createdAt, expiresAt } with TTL index on expiresAt (expireAfterSeconds: 0).
conversations / messages
conversations: { _id, participants: [userId], lastMessage, updatedAt }
messages: { _id, conversationId, senderId, body, readBy: [], createdAt }
Index: (conversationId, createdAt desc).
notifications: { userId, type, actorId, targetId, read, createdAt }, index (userId, read, createdAt desc).
refresh_tokens: { userId, tokenHash, family, expiresAt, revokedAt } for rotation and reuse detection.
moderation_queue: { targetType, targetId, reason, scores, status: "open"|"approved"|"removed", reviewedBy }.
4.2 Counters
Denormalized counters (likesCount, followersCount) are updated with $inc in the same operation as the write. Run a nightly reconciliation job to fix drift. Mention this tradeoff in the README.
5. API Design
REST, JSON, versioned under /api/v1. All inputs validated with Zod. Errors follow one envelope: { error: { code, message, details? } }.
Area
Endpoints
Auth
POST /auth/register, /auth/login, /auth/refresh, /auth/logout, GET /auth/verify-email, POST /auth/google
Users
GET /users/:username, PATCH /users/me, POST /users/:id/follow, DELETE /users/:id/follow, GET /users/:id/followers
Posts
POST /posts, GET /posts/:id, DELETE /posts/:id, POST /posts/:id/like, POST /posts/:id/save, GET /users/:id/posts?cursor=
Comments
POST /posts/:id/comments, GET /posts/:id/comments?cursor=, DELETE /comments/:id
Feed
GET /feed?cursor=&mode=ranked|chronological
Stories
POST /stories, GET /stories/feed
Search
GET /search/users?q=, GET /search/semantic?q=&cursor=, GET /search/hashtags?q=
Chat
GET /conversations, GET /conversations/:id/messages?cursor=, plus Socket.IO events
AI
POST /posts/:id/ask (RAG over post), GET /posts/:id/suggestions
Admin
GET /admin/moderation, POST /admin/moderation/:id/resolve
Uploads
POST /uploads/sign (signed upload params)
Pagination: cursor-based using (createdAt, _id) encoded as opaque base64. No skip/offset anywhere. Explain why in the README (offset degrades at depth and breaks under inserts).
Idempotency: POST /posts accepts an Idempotency-Key header to prevent double-posts on retry.
6. Feed Design
6.1 Strategy: hybrid fan-out
• Fan-out on write for normal users: when a post is published, insert feed_items for each follower via a background job (batched insertMany).
• Fan-out on read for high-follower accounts (threshold, e.g. > 10,000 followers): skip write fan-out; merge their recent posts at read time.
• Feed read = fetch user's feed_items page + merge celebrity posts + hydrate posts and authors (batched $in queries) + rank.
6.2 Caching
• Redis cache of the first feed page per user, TTL 60s, key feed:{userId}:v{n}.
• Post and user hydration cached with post:{id} and user:{id} (TTL 5 min).
• Invalidation: bump per-user feed version on new fan-out arrival; delete post:{id} on edit/delete; counters read from cache with write-through updates.
• Protect against stampede with a short Redis lock or request coalescing on cache miss.
6.3 Ranking modes
• chronological: baseline.
• ranked: score = weighted sum of recency decay, author affinity, engagement velocity, and embedding similarity to the user's interest vector (Section 7.4).
7. AI Features
7.1 Auto-captions and hashtag suggestions
• Input: image URL(s). Output: 3 caption options, 10 ranked hashtags.
• Implementation: vision-capable LLM API with a structured JSON prompt; validate output with Pydantic; retry on malformed JSON.
• Hashtag grounding: merge LLM tags with nearest-neighbor tags from existing popular posts (via CLIP similarity) so suggestions match your actual tag vocabulary.
• Delivery: async job, pushed to the client over Socket.IO as post:suggestions.
• Cost control: cache by image hash; skip if caption already provided; per-user daily quota.
7.2 Semantic search (flagship feature)
• Indexing: on publish, compute a CLIP image embedding (512-d for ViT-B/32), store in Qdrant with payload {postId, authorId, createdAt, hashtags, visibility}.
• Query: text query goes through the CLIP text encoder, then ANN search (cosine) with payload filters (public only, not blocked authors), then hydrated through Node.
• Hybrid option: combine vector score with a Mongo text/BM25 score on captions and hashtags (reciprocal rank fusion).
• Index hygiene: delete vectors on post deletion; store embeddingVersion so a model upgrade triggers a re-index job.
• Evaluation: build a labeled set of 50-100 queries with expected relevant posts. Report precision@10 and MRR for: keyword-only, vector-only, hybrid. This table goes in the README.
7.3 Content moderation pipeline
• Images: NSFW classifier on upload, with thresholds: below 0.3 auto-publish; 0.3 to 0.8 route to admin queue; above 0.8 auto-block.
• Text: toxicity classifier on comments and captions (HuggingFace model such as toxic-bert family).
• Design: fail-open vs fail-closed is an explicit decision. Recommended: posts stay pending_moderation until the check returns (fail-closed for media), comments are published immediately and retroactively hidden (fail-open for text).
• Admin UI: simple queue with approve/remove and the model scores visible.
• Audit: every decision stored with model version and scores.
7.4 Personalized feed ranking
• User interest vector: exponentially weighted average of embeddings of posts the user liked, saved, or dwelled on. Updated by a periodic job and on strong signals.
• Candidate set: feed_items plus recent posts from vector neighbors of the interest vector (light discovery).
• Score: score = w1*recencyDecay + w2*authorAffinity + w3*engagementVelocity + w4*cosine(userVec, postVec); weights tuned offline.
• Evaluation: seed 200-500 synthetic users with scripted behavior profiles (e.g. a "travel" persona likes travel posts). Compare chronological vs ranked on simulated CTR/like-rate and NDCG@20. Report honestly that this is simulated.
• Serving: ranking runs inside Node using precomputed vectors from Redis, or via a fast AI-service endpoint with a 50ms budget and fallback to chronological on timeout.
7.5 "Ask about this post" (RAG)
• Corpus per post: caption, hashtags, AI-generated image description, top comments, author bio.
• Flow: chunk, embed (text embedding model), retrieve top-k, generate a grounded answer with citations to the source snippets; refuse if context is insufficient.
• Guardrails: prompt-injection-safe formatting (user-generated text delimited and treated as data), output length caps, rate limit per user.
• Variant: smart reply suggestions for comments and DMs, using the same retrieval layer.
7.6 Stretch: near-duplicate detection
Perceptual hash (pHash) for exact-ish duplicates plus CLIP cosine above a threshold for semantic duplicates. Used to flag reposts and spam.
8. Real-Time Layer
• Socket.IO namespaces: /chat, /notifications.
• Auth at handshake using the access JWT; reject and disconnect on expiry, client refreshes and reconnects.
• Rooms: user:{id} for notifications, conv:{id} for chat.
• Redis adapter so multiple Node instances share events.
• Presence: Redis keys with TTL heartbeat (presence:{userId}), publish changes only to followers who are online.
• Delivery semantics: messages persisted first, then emitted; client acks; on reconnect the client fetches missed messages via REST using the last seen message id.
• Typing indicators are ephemeral (not stored).
9. Async Job Pipeline
Queue
Producer
Consumer
Purpose
post.analyze
Node
AI worker
NSFW, embedding, captions
post.analyzed
AI worker
Node
Persist results, publish
feed.fanout
Node
Node worker
Fan-out to followers
comment.moderate
Node
AI worker
Toxicity check
user.vector.update
Node
AI worker
Interest vector refresh
reindex
Admin
AI worker
Re-embed after model upgrade
Reliability rules
• Every job has an idempotency key; consumers are safe to run twice.
• Retries with exponential backoff (e.g. 3 to 5 attempts), then dead-letter queue.
• Job payloads carry IDs and URLs, never large blobs.
• A scheduled job alerts when DLQ depth or queue lag exceeds thresholds.
• Graceful shutdown: workers finish in-flight jobs on SIGTERM.
10. Security
• Auth: short-lived access JWT (15 min) in memory; refresh token (7-30 days) in an httpOnly, secure, SameSite cookie; rotation on every refresh with reuse detection (revoke the whole token family).
• Passwords: argon2id or bcrypt (cost 12).
• Validation: Zod on every route; reject unknown fields.
• Rate limiting: Redis sliding window per IP and per user; stricter on auth, upload, and AI endpoints.
• Uploads: signed URLs, MIME and size checks, strip EXIF/location data, virus scan optional.
• Web: Helmet, strict CORS allowlist, CSRF protection for cookie flows, output encoding to prevent XSS.
• NoSQL injection: sanitize operators ($-keys) from user input.
• Authorization: ownership checks in a middleware layer; private-account and block rules enforced in queries, not just in the UI.
• Secrets: environment variables, never in the repo; .env.example provided.
• AI-specific: prompt injection handling in RAG, per-user quotas on paid model calls, PII-free logs.
11. Observability
• Logs: structured JSON (pino) with requestId propagated from Node into the AI service.
• Metrics (Prometheus): HTTP latency histograms, error rate, cache hit ratio, queue depth and job duration, model inference latency, Socket.IO connection count.
• Dashboards (Grafana): one for API health, one for AI pipeline. Screenshot both for the README.
• Alerts (optional): DLQ growth, p95 latency over budget.
• Error tracking: Sentry free tier on both services.
12. Testing Strategy
Level
Tools
What to cover
Unit
Jest, pytest
Feed ranking math, cursor encoding, token rotation, moderation thresholds
Integration
Supertest + mongodb-memory-server / Testcontainers
Auth flow, post creation, follow + feed, comments
Contract
Zod/Pydantic shared schemas or OpenAPI checks
Node-to-AI message formats
E2E
Playwright
Signup, post, see in feed, semantic search
Load
k6
Feed read, post create, search under 100/500 concurrent users
AI quality
pytest + labeled sets
Retrieval precision@k, moderation recall on a small labeled set
Target: 70%+ coverage on core business logic. CI must be green with a visible badge.
13. DevOps and Deployment
• Local: docker compose up starts Mongo, Redis, Qdrant, Node API, AI service, worker, frontend.
• CI (GitHub Actions): lint, typecheck, unit and integration tests, build Docker images, push to registry on main.
• CD: deploy API and AI service as containers (AWS ECS/EC2 or Render); frontend on Vercel/Netlify or S3+CloudFront; Mongo Atlas free tier; managed Redis (Upstash).
• Cost note: CLIP on CPU is fine for a portfolio-scale index (tens of thousands of images). Document that GPU would be the production choice.
• Environments: dev and prod configs; migrations via a simple script or migrate-mongo.
14. Repository Structure
lumen/
  apps/
    web/                  # React + Vite
      src/{components,pages,hooks,store,api,lib}
    api/                  # Node + Express + TS
      src/{modules,middleware,jobs,sockets,config,utils}
      src/modules/{auth,users,posts,feed,comments,chat,search,admin}
    ai-service/           # Python
      app/{api,workers,models,pipelines,schemas,vectorstore}
      tests/
  packages/
    contracts/            # shared Zod schemas / OpenAPI / JSON schema
  infra/
    docker-compose.yml
    nginx/
    grafana/ prometheus/
  loadtests/              # k6 scripts
  docs/                   # architecture, ADRs, eval reports
  .github/workflows/
  README.md
Keep Architecture Decision Records (short markdown files) in docs/adr/: why hybrid fan-out, why Qdrant, why async queue, why cursor pagination. Interviewers love these.
15. Six-Week Execution Plan
Week
Deliverables
Exit criteria
1
Repo scaffold, Docker Compose, auth (JWT + refresh rotation), user profile, media upload, create/read posts, follow/unfollow
Can register, post an image, follow a user
2
Fan-out feed, cursor pagination, likes, nested comments, Redis cache, rate limiting, Zod validation
Feed works for 1,000 seeded users; cache hit ratio measured
3
Socket.IO DMs, notifications, presence, stories with TTL, frontend polish for core flows
Real-time chat works across two browsers
4
FastAPI service, BullMQ integration, retries and DLQ, moderation pipeline, captions and hashtags
Upload triggers async analysis and result appears in UI
5
CLIP indexing, semantic search with filters, hybrid search, interest vectors and ranked feed, evaluation scripts
Eval tables for search and ranking generated
6
RAG "ask post", tests to target coverage, k6 load test, Grafana dashboards, CI/CD, deploy, README, demo video
Live URL, green CI, README complete
Rule: if a week slips, cut from the stretch list (Section 17), never from tests, deployment, or the README.
16. Metrics to Collect (for README and resume)
• Feed API p50/p95/p99 before and after Redis and fan-out (k6).
• Cache hit ratio for feed and post hydration.
• Semantic search precision@10 and MRR: keyword vs vector vs hybrid.
• Ranked vs chronological feed: simulated like-rate and NDCG@20.
• Moderation: precision/recall on a small labeled set; false-positive rate.
• Async pipeline: median and p95 time from upload to "published".
• Queue reliability: retry success rate, DLQ count under injected failures.
• Test coverage percentage and CI duration.
Only claim numbers you actually measured. State the dataset size and that traffic is synthetic where it is.
17. Scope Control
Must have: auth, posts, follow, feed, comments/likes, chat, async AI pipeline, semantic search, moderation, tests, deployment, README.
Should have: ranked feed with eval, RAG on posts, stories, Grafana dashboards.
Stretch: near-duplicate detection, OAuth, push notifications, admin analytics.
Do not build: Reels/video, live streaming, shop, highlights, polished animations.
18. Risks and Mitigations
Risk
Mitigation
Scope creep across 5 AI features
Build in the order: moderation, captions, search, ranking, RAG. Ship each behind a feature flag
Model inference too slow/expensive
Cache by image hash, batch jobs, CPU-friendly models, quotas, fallbacks
Cold start: no data to demo search/ranking
Seed script with 10k to 50k public-domain images (e.g. open datasets) and synthetic users
Queue message loss or duplicates
Idempotency keys, acks, DLQ, reconciliation job
Time overrun
Fixed weekly exit criteria, cut-list discipline
Hosted LLM cost
Free-tier or small models for dev, strict quotas, response caching
19. README Checklist
1. One-paragraph pitch and a demo GIF at the top.
2. Live link and test credentials.
3. Architecture diagram and the upload-to-AI sequence.
4. Feature list with screenshots.
5. Key design decisions and tradeoffs (link to ADRs).
6. Benchmarks and evaluation tables (with methodology).
7. How to run locally in under five commands.
8. Testing and CI badges.
9. Known limitations and what you would do at 100x scale.
20. Resume Bullets (templates; fill with real numbers)
• Built Lumen, a full-stack social platform (React, Node, MongoDB, Redis, FastAPI) with an async AI pipeline processing uploads through moderation, embedding, and captioning in a median of X seconds.
• Implemented CLIP-based semantic image search over N images with Qdrant; hybrid retrieval improved precision@10 from A to B versus keyword search.
• Designed hybrid fan-out feed with Redis caching, cutting feed p95 latency from X ms to Y ms at Z concurrent users (k6).
• Added embedding-based feed ranking; simulated A/B showed +X% like-rate versus chronological.
• Shipped CI/CD with Jest/pytest suites (X% coverage), Prometheus/Grafana monitoring, and Dockerized deployment on AWS.
21. Interview Preparation Map
Be ready to answer, from your own implementation:
• Fan-out on write vs read: why hybrid, where is the threshold, what breaks at 10M followers?
• Why a queue between Node and Python? What happens if a worker dies mid-job?
• How do you guarantee no double-processing? (idempotency keys, upserts)
• Cursor vs offset pagination, and how the cursor handles ties.
• Refresh token rotation and reuse detection: what attack does it stop?
• Cache invalidation: what is stale, for how long, and is that acceptable?
• How do you evaluate semantic search? What are its failure modes (bias, out-of-vocabulary queries)?
• How would you re-index 10M vectors after a model change without downtime? (versioned collections, dual-write, alias swap)
• Mongo indexing choices and an explain() you ran that changed a design.
• What would you change to run this on Kubernetes with autoscaling workers?
22. Definition of Done
• Deployed, publicly accessible, with seeded demo data.
• CI green; core logic covered by tests.
• Load test report and evaluation tables committed in docs/.
• README, ADRs, and architecture diagram complete.
• A 2 to 3 minute demo video showing upload, async AI results, semantic search, and the ranked feed.