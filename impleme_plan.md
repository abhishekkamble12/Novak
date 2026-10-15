# Novak — Implementation Plan

**Author:** Abhishek  
**Created:** 2026-10-15  
**Reference:** [project.md](./project.md)  
**Timeline:** 6 Weeks (42 days)  
**Status:** 🟡 Planning

---

## Table of Contents

1. [Pre-Development Phase (Days 0–2)](#phase-0-pre-development-days-02)
2. [Week 1 — Foundation & Core CRUD](#week-1--foundation--core-crud-days-39)
3. [Week 2 — Feed Engine, Caching & Social Features](#week-2--feed-engine-caching--social-features-days-1016)
4. [Week 3 — Real-Time Layer & Frontend Polish](#week-3--real-time-layer--frontend-polish-days-1723)
5. [Week 4 — AI Service & Async Pipeline](#week-4--ai-service--async-pipeline-days-2430)
6. [Week 5 — Semantic Search, Ranking & Evaluation](#week-5--semantic-search-ranking--evaluation-days-3137)
7. [Week 6 — RAG, Testing, Deployment & Polish](#week-6--rag-testing-deployment--polish-days-3842)
8. [Architecture Decision Records (ADRs)](#architecture-decision-records-adrs)
9. [Quality Gates & Exit Criteria](#quality-gates--exit-criteria)
10. [Risk Tracker](#risk-tracker)
11. [Dependency Map](#dependency-map)
12. [Resume Metrics Collection Plan](#resume-metrics-collection-plan)

---

## Phase 0: Pre-Development (Days 0–2)

> **Goal:** Zero-friction dev environment. Every team member (or future you) runs one command and has a working stack.

### Day 0 — Repository & Tooling Scaffold

- [x] **Initialize monorepo** at workspace root with the following structure:
  ```
  apps/
    web/          # React + Vite + TypeScript + Tailwind
    api/          # Node + Express + TypeScript
    ai-service/   # Python 3.11 + FastAPI + Qdrant
  packages/
    contracts/    # Shared Zod schemas + API contracts
  infra/
    docker-compose.yml
    docker-compose.override.yml   # dev overrides (volumes, hot-reload)
    nginx/
  docs/
    adr/          # Architecture Decision Records
  .github/
    workflows/
      ci.yml
  .env.example
  README.md
  ```
- [x] **Initialize `apps/web`**: React 18 + Vite + TypeScript
  - Installed and configured: `react-router-dom`, `@tanstack/react-query`, `zustand`, `socket.io-client`, `axios`, `tailwindcss` (custom dark theme & brand neon gradients)
  - Configured path aliases (`@/*`) and Google Fonts typography (Outfit & Inter)
  - Implemented Feed, Stories, Explore (AI semantic search), Auth, and Create Post Modal
- [x] **Initialize `apps/api`**: TypeScript Node + Express scaffold
  - Installed & configured: `express`, `mongoose`, `zod`, `pino`, `bullmq`, `ioredis`, `socket.io`, `@socket.io/redis-adapter`, `jsonwebtoken`, `argon2`, `helmet`, `cors`, `multer`, `cloudinary`
  - `tsconfig.json` with strict mode, path aliases, ES2022 target
  - Folder structure: `src/config/`, `src/middleware/`, `src/modules/health/`, `src/utils/`, `src/app.ts`, `src/server.ts`
- [x] **Initialize `apps/ai-service`**: Python FastAPI microservice
  - `pyproject.toml` and `requirements.txt` with `fastapi`, `uvicorn`, `pydantic`, `qdrant-client`, `redis`, `pillow`
  - Architecture: `app/config.py`, `app/main.py`, `app/schemas/`, `app/models/` (CLIP inference loader & safety moderation), `app/vectorstore/qdrant.py`, `app/api/` (inference routes)
- [x] **Initialize `packages/contracts`**: shared Zod schemas & TypeScript types
  - `common.ts` (API envelope & cursor pagination), `auth.ts`, `post.ts` (PostAnalyzeJob / PostAnalyzedResult), `ai.ts` (moderation & semantic search)

### Day 1 — Docker Compose & Infrastructure

- [x] **`docker-compose.yml`** with all services:
  - `mongo` (MongoDB 7, port 27017, volume `mongo_data`, healthcheck)
  - `redis` (Redis 7.2, port 6379, volume `redis_data`, healthcheck)
  - `qdrant` (Qdrant vector engine, ports 6333/6334, volume `qdrant_data`, healthcheck)
  - `api` (Node API with healthcheck & dependencies)
  - `ai-service` (FastAPI AI engine with healthcheck & dependencies)
  - `web` (Vite / Nginx frontend bundle)
  - `nginx` (Reverse proxy routing `/api/`, `/socket.io/`, `/*`)
- [x] **`docker-compose.override.yml`** for dev hot-reloads and volume mounts
- [x] **Nginx config**: `infra/nginx/nginx.conf` routing reverse proxy
- [x] **`.env.example`** with all documented environment variables
- [x] **Write ADR-001**: "Why Docker Compose for local development" (`docs/adr/ADR-001-docker-compose-local-dev.md`)

### Day 2 — CI Pipeline, Linting & Shared Configs

- [x] **GitHub Actions CI** (`.github/workflows/ci.yml`):
  - Lint & Typecheck contracts, API, and Web
  - Python AI service validation with Ruff
  - Docker container build validation
- [x] **Shared error envelope & standard responses**:
  - `packages/contracts/src/schemas/common.ts` & `apps/api/src/utils/responseEnvelope.ts`
- [x] **Config module** for `apps/api`:
  - `src/config/env.ts` — load and validate all env vars with Zod
  - `src/config/db.ts` — Mongoose connection with reconnection handling & connection pooling
  - `src/config/redis.ts` — ioredis client with reconnect backoff strategy
  - `src/config/logger.ts` — pino structured logger with development pretty printer
- [x] **Global middleware stack**:
  - `helmet()`, `cors()`, `express.json({ limit: '10mb' })`
  - `errorHandler` (catches Zod errors, AppError, unexpected 500s)
  - `notFound` (404 fallback)
  - `globalRateLimiter` & `authRateLimiter` (Redis-backed)
  - `requireAuth` & `optionalAuth` (JWT)
  - `GET /api/health` checking MongoDB and Redis status
- [x] **Write ADR-002**: "Asynchronous AI Pipeline via BullMQ & Redis" (`docs/adr/ADR-002-async-ai-pipeline.md`)

> **Exit Criteria Phase 0:** ✅ Zero-friction multi-service monorepo scaffold completed across frontend, backend, AI microservice, contracts, and Docker Compose infrastructure.

---

## Week 1 — Foundation & Core CRUD (Days 3–9)

> **Goal:** A user can register, log in, upload an image, create a post, view profiles, and follow/unfollow others. Auth is production-grade from Day 1.

### Day 3 — Authentication (Part 1: Register + Login)

- [ ] **User model** (`modules/users/user.model.ts`):
  - Fields: `_id`, `username` (unique), `email` (unique), `passwordHash`, `avatarUrl`, `bio`, `followersCount`, `followingCount`, `postsCount`, `roles`, `emailVerified`, `createdAt`
  - Indexes: `username` (unique), `email` (unique), text index on `username` + `bio`
  - Pre-save hook: lowercase email
- [ ] **Auth schemas** (Zod):
  - `registerSchema`: username (3-30 chars, alphanumeric+underscore), email, password (min 8, complexity check)
  - `loginSchema`: email, password
- [ ] **Auth service**:
  - `register()`: check uniqueness, hash with `argon2id`, create user, generate tokens
  - `login()`: find by email, verify password, generate tokens
  - `generateTokenPair()`: access JWT (15 min, payload: `{ userId, roles }`), refresh token (30 days, stored hashed in DB)
- [ ] **Refresh token model** (`refresh_tokens` collection):
  - Fields: `userId`, `tokenHash`, `family` (UUID for rotation tracking), `expiresAt`, `revokedAt`
  - Index: `tokenHash` (unique), TTL index on `expiresAt`
- [ ] **Auth routes**: `POST /api/v1/auth/register`, `POST /api/v1/auth/login`
- [ ] **Auth middleware** (`middleware/auth.ts`):
  - Extract Bearer token, verify JWT, attach `req.user = { userId, roles }`
  - Handle expired/invalid tokens with proper error codes
- [ ] **Validation middleware** (`middleware/validate.ts`): generic Zod validator factory
- [ ] **Tests**: register (success, duplicate email, weak password), login (success, wrong password, nonexistent user)

### Day 4 — Authentication (Part 2: Token Rotation + Security)

- [ ] **Refresh endpoint** (`POST /api/v1/auth/refresh`):
  - Accept refresh token from httpOnly cookie
  - Hash incoming token, find in DB, check expiry, check not revoked
  - **Rotation**: issue new access + refresh tokens, revoke the old refresh token
  - **Reuse detection**: if the incoming token is already revoked, revoke the entire family (compromised)
- [ ] **Logout** (`POST /api/v1/auth/logout`): revoke the refresh token, clear the cookie
- [ ] **Cookie configuration**: `httpOnly: true`, `secure: true` (in prod), `sameSite: 'strict'`, `path: '/api/v1/auth'`
- [ ] **Rate limiting middleware** (`middleware/rateLimit.ts`):
  - Redis sliding window implementation
  - Tiers: auth endpoints (5 req/min/IP), general API (100 req/min/user), uploads (10 req/min/user)
- [ ] **Tests**: refresh flow, rotation, reuse detection (critical!), logout, rate limiting
- [ ] **Write ADR-002**: "JWT + Refresh Token Rotation with Reuse Detection"

### Day 5 — User Profiles & Media Upload

- [ ] **User routes**:
  - `GET /api/v1/users/:username` — public profile (select fields, don't expose email/passwordHash)
  - `PATCH /api/v1/users/me` — update bio, avatarUrl (auth required)
  - Zod schema for profile update with `.partial()`
- [ ] **Upload service** (`modules/uploads/`):
  - `POST /api/v1/uploads/sign` — returns signed upload params for Cloudinary (or S3 pre-signed URL)
  - Configuration: max file size (10MB), allowed MIME types (image/jpeg, image/png, image/webp)
  - Client-side: upload directly to Cloudinary using signed params, receive the URL
  - Alternative for MVP: direct upload through Node with multer + Cloudinary SDK
- [ ] **Avatar upload flow**: PATCH /users/me with new avatarUrl after Cloudinary upload
- [ ] **EXIF stripping**: configure Cloudinary transformation to strip metadata, or use `sharp` if self-hosted
- [ ] **Tests**: get profile (existing, non-existing), update profile (auth, validation), upload signing

### Day 6 — Posts CRUD

- [ ] **Post model** (`modules/posts/post.model.ts`):
  - Fields as specified in data model (Section 4.1)
  - Indexes: `(authorId, createdAt desc)`, `hashtags`, `(status, createdAt)`
  - Virtual: `isOwner` (populated in controller)
- [ ] **Post schemas** (Zod):
  - `createPostSchema`: media array (1-10 items, each with url + dimensions), caption (max 2200 chars), hashtags (max 30)
  - `Idempotency-Key` header schema
- [ ] **Post service**:
  - `create()`: validate idempotency key, save with `status: 'published'` (will become `pending_moderation` in Week 4), increment user.postsCount
  - `getById()`: find by ID, check visibility (public/private account, blocked users — stub for now)
  - `delete()`: ownership check, soft delete or hard delete, decrement postsCount, clean up related data
  - `getByUser()`: cursor-paginated, using `(createdAt, _id)` compound cursor
- [ ] **Cursor pagination utility** (`utils/cursor.ts`):
  ```typescript
  // Encode: { createdAt, _id } → base64 opaque string
  // Decode: base64 → { createdAt, _id }
  // Query: { $or: [{ createdAt: { $lt } }, { createdAt, _id: { $lt } }] }
  // Response: { data: T[], cursor: string | null, hasMore: boolean }
  ```
- [ ] **Idempotency middleware** (`middleware/idempotency.ts`):
  - Store `Idempotency-Key` → response in Redis with TTL (24h)
  - On duplicate key: return cached response without re-executing
- [ ] **Post routes**: `POST /posts`, `GET /posts/:id`, `DELETE /posts/:id`, `GET /users/:id/posts?cursor=`
- [ ] **Tests**: create (success, idempotency, validation), read (existing, not found), delete (owner, non-owner), pagination (cursor correctness, empty page)
- [ ] **Write ADR-003**: "Cursor-based pagination over offset"

### Day 7 — Follow System & Blurhash

- [ ] **Follow model** (`follows` collection):
  - Fields: `followerId`, `followeeId`, `createdAt`
  - Indexes: unique `(followerId, followeeId)`, `(followeeId, createdAt)` for follower list
- [ ] **Follow service**:
  - `follow()`: insert follow doc + `$inc followersCount/followingCount` on both users **in a transaction** (or at minimum, use `$inc` atomically and accept minor drift with nightly reconciliation)
  - `unfollow()`: delete follow doc + `$inc -1` on both users
  - `getFollowers()`: cursor-paginated
  - `getFollowing()`: cursor-paginated
  - `isFollowing()`: fast lookup for UI toggle
- [ ] **Follow routes**:
  - `POST /api/v1/users/:id/follow`
  - `DELETE /api/v1/users/:id/follow`
  - `GET /api/v1/users/:id/followers?cursor=`
  - `GET /api/v1/users/:id/following?cursor=`
- [ ] **Blurhash generation**: on post creation, generate blurhash for each image (using `blurhash` npm package or Cloudinary's built-in) and store in `media[].blurhash`
- [ ] **Counter reconciliation script** (`scripts/reconcile-counters.ts`):
  - Recalculate `followersCount`, `followingCount`, `postsCount`, `likesCount` from source-of-truth collections
  - Log discrepancies
  - Designed to run as a nightly cron
- [ ] **Tests**: follow/unfollow (success, self-follow prevention, duplicate follow), counter accuracy

### Day 8 — Frontend: Auth & Core Layout

- [ ] **Design system setup**:
  - Tailwind config: custom color palette (dark mode primary), typography scale, spacing
  - Global styles: CSS variables for theme tokens
  - Font: Inter from Google Fonts
- [ ] **Layout components**:
  - `AppShell` — sidebar nav (desktop) + bottom nav (mobile) + main content area
  - `Sidebar` — logo, nav links (Home, Search, Messages, Notifications, Profile), create post button
  - `MobileNav` — bottom tab bar
- [ ] **Auth pages**:
  - `LoginPage` — email + password form, link to register, Google OAuth button (placeholder)
  - `RegisterPage` — username + email + password form, validation errors
  - Auth state management with Zustand: `useAuthStore` (user, tokens, login, logout, refresh)
- [ ] **API client** (`api/client.ts`):
  - Axios instance with base URL, interceptors for:
    - Attach access token to Authorization header
    - On 401: attempt token refresh, retry original request, logout on failure
- [ ] **React Query setup**:
  - QueryClient with default staleTime, retry config
  - Custom hooks: `useLogin`, `useRegister`, `useCurrentUser`
- [ ] **Protected route wrapper**: redirect to login if not authenticated

### Day 9 — Frontend: Posts & Profile

- [ ] **Create Post flow**:
  - `CreatePostModal` — drag-and-drop image upload (to Cloudinary), caption input, hashtag input with autocomplete (stub)
  - Upload progress indicator
  - Blurhash placeholder while image loads
  - React Query mutation: `useCreatePost`
- [ ] **Post components**:
  - `PostCard` — author header (avatar, username, timestamp), image carousel (if multi-image), caption, like/comment/share/save action bar, like count, top comments preview
  - `PostDetailPage` — full post view with all comments
- [ ] **Profile page**:
  - `ProfilePage` — avatar, username, bio, stats (posts/followers/following), follow/unfollow button, post grid
  - `EditProfileModal` — update bio, avatar
  - React Query hooks: `useUser`, `useUserPosts`, `useFollow`, `useUnfollow`
- [ ] **Image optimization**: lazy loading, blurhash decode for placeholder, responsive srcset from Cloudinary transforms

> **✅ Week 1 Exit Criteria:**
> - [ ] User can register, log in, refresh tokens, and log out
> - [ ] User can upload images and create posts
> - [ ] User can view profiles and post grids
> - [ ] User can follow/unfollow other users
> - [ ] Cursor pagination works on all list endpoints
> - [ ] Token rotation with reuse detection is tested
> - [ ] Rate limiting is active on auth endpoints
> - [ ] CI pipeline passes with auth + posts + follows tests

---

## Week 2 — Feed Engine, Caching & Social Features (Days 10–16)

> **Goal:** Feed works for 1,000+ seeded users with measurable cache hit ratio. Likes and nested comments are complete.

### Day 10 — Likes & Bookmarks

- [ ] **Like model** (`likes` collection):
  - Fields: `userId`, `targetType` (post | comment), `targetId`, `createdAt`
  - Index: unique `(userId, targetType, targetId)`
- [ ] **Like service**:
  - `like()`: insert like + `$inc likesCount` on target (post or comment)
  - `unlike()`: delete like + `$inc -1 likesCount`
  - `isLiked()`: fast lookup for UI (batch-check for feed hydration)
  - `getLikedPostIds()`: for a set of post IDs, return which ones the current user has liked (single query with `$in`)
- [ ] **Bookmark/Save**: similar pattern to likes but separate collection (`saves`), no public count
- [ ] **Like routes**:
  - `POST /api/v1/posts/:id/like`
  - `DELETE /api/v1/posts/:id/like`
  - `POST /api/v1/posts/:id/save`
  - `DELETE /api/v1/posts/:id/save`
- [ ] **Tests**: like/unlike, double-like prevention, counter accuracy, batch lookup

### Day 11 — Comments (Nested, Two-Level)

- [ ] **Comment model** (`comments` collection):
  - Fields: `postId`, `authorId`, `parentId` (null for top-level), `body`, `likesCount`, `toxicityScore` (null initially), `createdAt`
  - Indexes: `(postId, parentId, createdAt)`
  - **Two-level nesting only**: top-level comments + replies. Replies to replies get flattened to the parent.
- [ ] **Comment service**:
  - `create()`: validate parentId depth (reject if parent is already a reply), increment post.commentsCount
  - `getByPost()`: cursor-paginated top-level comments, with up to 3 latest replies embedded per comment (aggregation pipeline)
  - `getReplies()`: cursor-paginated replies for a specific parent comment
  - `delete()`: ownership or admin check, decrement commentsCount
- [ ] **Comment routes**:
  - `POST /api/v1/posts/:id/comments` (body + optional parentId)
  - `GET /api/v1/posts/:id/comments?cursor=`
  - `GET /api/v1/comments/:id/replies?cursor=`
  - `DELETE /api/v1/comments/:id`
- [ ] **Tests**: create comment, create reply, nested depth limit, pagination, delete (owner, non-owner)

### Day 12 — Feed: Fan-Out on Write

- [ ] **Feed item model** (`feed_items` collection):
  - Fields: `userId`, `postId`, `authorId`, `score` (default: 0, used later for ranking), `createdAt`
  - Index: `(userId, createdAt desc)`
  - Cap: ~500 items per user (enforced by trimming job)
- [ ] **Feed fan-out job** (`jobs/feedFanout.ts`):
  - Triggered when a post reaches `status: 'published'`
  - Fetch all follower IDs of the author (paginated reads from `follows`)
  - Batch `insertMany` into `feed_items` (chunks of 500)
  - Skip followers who have > 500 feed items (or trim oldest after insert)
  - **Idempotency**: upsert with `(userId, postId)` to prevent duplicates on retry
- [ ] **BullMQ setup** (`config/queue.ts`):
  - Queue: `feed.fanout`
  - Connection: shared ioredis instance
  - Worker with concurrency 5
  - Default job options: `{ attempts: 3, backoff: { type: 'exponential', delay: 1000 } }`
- [ ] **Fan-out trigger**: after post creation (or after moderation approval in Week 4), enqueue `feed.fanout` job
- [ ] **Tests**: fan-out creates feed items for all followers, handles large follower lists, idempotent on retry
- [ ] **Write ADR-004**: "Hybrid fan-out: write for normal users, read for celebrities"

### Day 13 — Feed: Read Path & Celebrity Merge

- [ ] **Feed service** (`modules/feed/feed.service.ts`):
  - `getFeed(userId, cursor, mode)`:
    1. Fetch user's `feed_items` page (cursor-paginated, 20 per page)
    2. Identify celebrity accounts the user follows (followers > threshold, e.g., 10,000 — configurable)
    3. Fetch recent posts from celebrities directly from `posts` collection
    4. Merge and deduplicate by `postId`
    5. Sort by `createdAt` desc (chronological mode) or by `score` desc (ranked mode — stubbed for now)
    6. **Hydrate**: batch-fetch post documents and author documents using `$in` queries
    7. Attach interaction state: `isLiked`, `isSaved` for current user (batch lookup)
    8. Return paginated response
- [ ] **Feed route**: `GET /api/v1/feed?cursor=&mode=chronological`
- [ ] **Feed trimming job**: periodic job to trim feed_items > 500 per user
- [ ] **Seed script** (`scripts/seed.ts`) — **CRITICAL for demo quality**:
  - Create 1,000 users with realistic usernames, bios, avatars (from UI Faces API or generated)
  - Create 5,000–10,000 posts with public-domain images (from Unsplash API or a downloaded dataset)
  - Create follow relationships (power-law distribution: most users follow 50–200, a few "celebrities" have 5,000+)
  - Create likes and comments (realistic distribution)
  - Run feed fan-out for all posts
  - **This script is essential — it makes the demo believable**
- [ ] **Tests**: feed read (empty, populated), celebrity merge, hydration correctness, pagination

### Day 14 — Redis Caching Layer

- [ ] **Cache service** (`utils/cache.ts`):
  ```typescript
  class CacheService {
    async getOrSet<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T>
    async invalidate(key: string): Promise<void>
    async invalidatePattern(pattern: string): Promise<void>
  }
  ```
- [ ] **Feed cache**:
  - Key: `feed:{userId}:v{version}` (version bumped on new fan-out arrival)
  - TTL: 60 seconds
  - Cache only the first page (most frequently accessed)
  - **Stampede protection**: Redis `SET NX` lock with short TTL (5s) while recomputing; other requests wait or get stale data
- [ ] **Post hydration cache**:
  - Key: `post:{postId}`, TTL: 5 minutes
  - Invalidate on edit/delete
  - Write-through for counter updates (like/comment counts)
- [ ] **User hydration cache**:
  - Key: `user:{userId}`, TTL: 5 minutes
  - Invalidate on profile update, follow/unfollow
- [ ] **Cache hit ratio tracking**:
  - Increment Redis counters: `cache:hits:{key-prefix}`, `cache:misses:{key-prefix}`
  - Expose via `GET /api/v1/admin/metrics/cache` (admin only)
- [ ] **Tests**: cache hit/miss, invalidation, stampede handling, version bumping
- [ ] **Write ADR-005**: "Redis caching strategy — TTLs, invalidation, and stampede protection"

### Day 15 — Frontend: Feed, Likes, Comments

- [ ] **Feed page** (`pages/FeedPage.tsx`):
  - Infinite scroll with `useInfiniteQuery` from React Query
  - `PostCard` with like/save toggle animations (heart animation on double-tap)
  - Pull-to-refresh on mobile
  - Skeleton loading states with blurhash placeholders
  - Empty state for new users (suggest people to follow)
- [ ] **Comment sheet/modal**:
  - Slide-up panel (mobile) or side panel (desktop) for comments
  - Top-level comments with "View replies" expansion
  - Reply input with `@username` mention
  - Real-time optimistic updates with React Query
- [ ] **Like interaction**:
  - Optimistic update: immediately toggle UI + update count
  - Rollback on error
  - Heart animation (CSS keyframes or Framer Motion)
- [ ] **Explore/Discover page** (placeholder): grid of popular posts (will be enhanced with semantic search in Week 5)

### Day 16 — Zod Validation Hardening & NoSQL Injection Prevention

- [ ] **Audit all routes**: ensure every input (body, params, query, headers) passes through Zod validation
- [ ] **NoSQL injection middleware** (`middleware/sanitize.ts`):
  - Strip `$`-prefixed keys from all user input recursively
  - Log attempts for security auditing
- [ ] **Input sanitization**: trim strings, normalize unicode, reject null bytes
- [ ] **Ownership middleware** (`middleware/ownership.ts`):
  - Generic factory: `requireOwnership(Model, paramName)` — checks `req.user.userId === doc.authorId`
  - Applied to: delete post, delete comment, update profile
- [ ] **Helmet configuration**: CSP headers, HSTS, X-Frame-Options, etc.
- [ ] **CORS configuration**: strict allowlist (frontend origin only)
- [ ] **Integration test sweep**: run all existing tests, fix any regressions from caching/feed changes

> **✅ Week 2 Exit Criteria:**
> - [ ] Feed works with fan-out on write, displaying posts from followed users
> - [ ] Celebrity merge prevents fan-out explosion for high-follower accounts
> - [ ] Redis caching is active with measurable hit ratio (target: >60% on feed first page)
> - [ ] Likes and nested comments work with proper counters
> - [ ] Cursor pagination is consistent across all list endpoints
> - [ ] Seed script populates 1,000 users / 5,000+ posts for realistic testing
> - [ ] All inputs are validated with Zod, NoSQL injection is mitigated
> - [ ] Frontend shows a polished feed with infinite scroll and interactions

---

## Week 3 — Real-Time Layer & Frontend Polish (Days 17–23)

> **Goal:** Real-time DMs and notifications work across multiple browser tabs. Stories with auto-expiry. Frontend is polished for core flows.

### Day 17 — Socket.IO Setup & Authentication

- [ ] **Socket.IO server** (`sockets/index.ts`):
  - Attach to HTTP server
  - Namespaces: `/chat`, `/notifications`
  - **Redis adapter** for horizontal scaling: `@socket.io/redis-adapter`
- [ ] **Socket auth middleware**:
  - Verify JWT at handshake (`socket.handshake.auth.token`)
  - Attach `socket.data.userId`
  - On token expiry: emit `auth:expired`, disconnect; client refreshes token and reconnects
- [ ] **Room management**:
  - On connect: join `user:{userId}` room (for notifications)
  - On joining a conversation: join `conv:{conversationId}` room
- [ ] **Presence system**:
  - On connect: set Redis key `presence:{userId}` with TTL 60s
  - Heartbeat: client pings every 30s, server refreshes TTL
  - On disconnect: delete presence key after grace period (30s)
  - Publish presence changes only to online followers (efficient fan-out via Redis pub/sub)

### Day 18 — Direct Messages (Chat)

- [ ] **Conversation model** (`conversations` collection):
  - Fields: `participants` (array of 2 userIds, sorted), `lastMessage` (embedded subset), `updatedAt`
  - Index: `participants` (to find existing conversation between two users)
- [ ] **Message model** (`messages` collection):
  - Fields: `conversationId`, `senderId`, `body`, `readBy` (array of userIds), `createdAt`
  - Index: `(conversationId, createdAt desc)`
- [ ] **Chat service**:
  - `getOrCreateConversation(userId1, userId2)`: find existing or create new
  - `sendMessage(conversationId, senderId, body)`: persist message, update conversation.lastMessage + updatedAt
  - `getMessages(conversationId, cursor)`: cursor-paginated
  - `markAsRead(conversationId, userId)`: update `readBy` on unread messages
  - `getConversations(userId, cursor)`: list user's conversations sorted by `updatedAt desc`, with unread count
- [ ] **Socket events** (namespace `/chat`):
  - Client emits: `message:send { conversationId, body }`, `message:read { conversationId }`, `typing:start { conversationId }`, `typing:stop { conversationId }`
  - Server emits: `message:new { message }`, `message:read { conversationId, userId }`, `typing { conversationId, userId }`
- [ ] **Delivery guarantee**: message persisted FIRST, then emitted via Socket.IO. On reconnect, client fetches missed messages via REST using last known message ID
- [ ] **Chat routes** (REST fallback):
  - `GET /api/v1/conversations`
  - `GET /api/v1/conversations/:id/messages?cursor=`
- [ ] **Tests**: create conversation, send message, pagination, read receipts, delivery on reconnect

### Day 19 — Notifications System

- [ ] **Notification model** (`notifications` collection):
  - Fields: `userId` (recipient), `type` (like | comment | follow | mention | post_published), `actorId`, `targetId`, `targetType`, `read`, `createdAt`
  - Index: `(userId, read, createdAt desc)`
- [ ] **Notification service**:
  - `create(notification)`: persist + emit via Socket.IO to `user:{userId}` room
  - `getByUser(userId, cursor)`: cursor-paginated, unread first
  - `markAsRead(notificationId)` and `markAllAsRead(userId)`
  - `getUnreadCount(userId)`: cached in Redis with write-through
- [ ] **Notification triggers** — emit notifications on:
  - New follower
  - Post liked
  - Post commented
  - Comment replied to
  - Post published (after AI moderation, Week 4)
- [ ] **Socket events** (namespace `/notifications`):
  - Server emits: `notification:new { notification }`, `notification:count { count }`
- [ ] **Notification routes**:
  - `GET /api/v1/notifications?cursor=`
  - `PATCH /api/v1/notifications/:id/read`
  - `PATCH /api/v1/notifications/read-all`
- [ ] **Tests**: notification creation on like/comment/follow, real-time delivery, read state

### Day 20 — Stories

- [ ] **Story model** (`stories` collection):
  - Fields: `authorId`, `mediaUrl`, `mediaType` (image), `viewers` (array of userIds), `createdAt`, `expiresAt` (24h from creation)
  - **TTL index**: `expiresAt` with `expireAfterSeconds: 0` — MongoDB auto-deletes expired stories
- [ ] **Story service**:
  - `create()`: upload media, set `expiresAt = now + 24h`
  - `getFeed(userId)`: get stories from followed users, grouped by author, sorted by recency. Exclude stories already viewed by this user
  - `markViewed(storyId, userId)`: add to `viewers` array
- [ ] **Story routes**:
  - `POST /api/v1/stories`
  - `GET /api/v1/stories/feed`
  - `POST /api/v1/stories/:id/view`
- [ ] **Tests**: create story, auto-expiry verification, feed retrieval, view tracking
- [ ] **Write ADR-006**: "TTL indexes for ephemeral content (stories)"

### Day 21 — Frontend: Chat UI

- [ ] **Chat page** (`pages/ChatPage.tsx`):
  - Conversation list sidebar with last message preview, unread badge, online indicator
  - Message thread view with bubbles (sent/received styling)
  - Message input with send button
  - Typing indicator ("User is typing...")
  - Auto-scroll to bottom on new message
  - Lazy-load older messages on scroll up (cursor pagination)
- [ ] **Socket.IO client integration** (`lib/socket.ts`):
  - Connection management: connect on auth, disconnect on logout
  - Auto-reconnect with token refresh
  - Event handlers for real-time updates
  - React hooks: `useSocket`, `useChatMessages`, `usePresence`

### Day 22 — Frontend: Notifications & Stories

- [ ] **Notifications dropdown/page**:
  - Bell icon with unread count badge (real-time updates)
  - Notification list with actor avatar, action text, timestamp
  - Click to navigate to the relevant content (post, profile, comment)
  - Mark as read on view
- [ ] **Stories bar** (top of feed):
  - Horizontal scroll of story circles (avatar + ring indicator for unviewed)
  - Story viewer: full-screen overlay with progress bar, tap to advance
  - Create story: camera/upload button as the first circle
- [ ] **Frontend polish pass**:
  - Dark mode toggle (system preference detection + manual override)
  - Loading skeletons on all pages
  - Error boundaries with retry buttons
  - Empty states with illustrations
  - Responsive design audit (mobile, tablet, desktop breakpoints)

### Day 23 — Frontend Polish & UX Refinement

- [ ] **Micro-animations**:
  - Page transitions (subtle fade/slide)
  - Like heart animation (double-tap on image)
  - Follow button state transition
  - Toast notifications (slide-in from top)
  - Skeleton shimmer effect
- [ ] **Accessibility pass**:
  - Semantic HTML, proper heading hierarchy
  - ARIA labels on interactive elements
  - Keyboard navigation for modals and dropdowns
  - Focus management on route changes
- [ ] **Performance audit**:
  - React Query cache tuning (staleTime, gcTime)
  - Image lazy loading with Intersection Observer
  - Bundle analysis with `rollup-plugin-visualizer`
  - Code splitting for routes (React.lazy + Suspense)
- [ ] **SEO setup**: proper title tags, meta descriptions, Open Graph tags for shared posts

> **✅ Week 3 Exit Criteria:**
> - [ ] Real-time DMs work across two browser tabs/windows
> - [ ] Notifications are delivered in real-time and persist correctly
> - [ ] Stories appear, auto-expire after 24h, and track viewers
> - [ ] Presence indicators show online status for followed users
> - [ ] Frontend is polished with dark mode, animations, and responsive layout
> - [ ] Socket.IO uses Redis adapter (ready for horizontal scaling)

---

## Week 4 — AI Service & Async Pipeline (Days 24–30)

> **Goal:** Upload triggers async AI analysis (NSFW check → embedding → captions). Results appear in the UI via real-time push. Moderation pipeline is operational.

### Day 24 — FastAPI Service Bootstrap & Model Loading

- [ ] **FastAPI app** (`app/main.py`):
  - Health endpoint: `GET /health` (returns model load status)
  - Lifespan handler: load models into memory on startup (CLIP, NSFW classifier, toxicity classifier)
  - CORS middleware (only accept requests from Node API or internal network)
  - Request ID propagation: accept `X-Request-ID` header from Node, attach to logs
- [ ] **Model loaders** (`app/models/`):
  - `clip.py`: load CLIP model (ViT-B/32) via `open_clip` or `sentence-transformers`
    - `encode_image(image_url) → np.array (512-d)`
    - `encode_text(text) → np.array (512-d)`
    - Warm up with a dummy inference on startup
  - `nsfw.py`: load NSFW classifier (e.g., `Falconsai/nsfw_image_detection` from HuggingFace)
    - `classify(image_url) → { nsfw_score: float, label: str }`
  - `toxicity.py`: load toxicity classifier (e.g., `unitary/toxic-bert`)
    - `classify(text) → { toxicity_score: float, labels: dict }`
- [ ] **Image download utility**: download image from URL to temp file, resize for model input, clean up
- [ ] **Pydantic schemas** (`app/schemas/`):
  - `PostAnalyzeJob`: postId, mediaUrls, authorId, idempotencyKey
  - `PostAnalyzedResult`: postId, embeddings, nsfwScores, moderationDecision, captions, hashtags
  - `ModerationResult`: targetType, targetId, scores, decision
- [ ] **Tests**: model loading, image encoding produces correct shape, NSFW classification returns valid scores

### Day 25 — BullMQ Integration (Node ↔ Python)

- [ ] **Queue architecture decision** — choose one:
  - **Option A (Recommended)**: Node produces jobs to BullMQ. Python polls Redis directly using a BullMQ-compatible consumer library (e.g., `bullmq` Python package or custom Redis consumer).
  - **Option B**: Node produces to BullMQ. Python exposes a FastAPI webhook endpoint. A Node worker dequeues and calls the Python API, then processes the response.
  - **Option C**: Use Redis Streams directly (both Node and Python use native Redis clients).
- [ ] **Node producer setup** (`jobs/producers.ts`):
  - Queue definitions: `post.analyze`, `comment.moderate`, `user.vector.update`, `reindex`
  - `enqueuePostAnalysis(postId, mediaUrls, authorId)`: add to `post.analyze` queue
  - `enqueueCommentModeration(commentId, text)`: add to `comment.moderate` queue
  - Job options: `{ attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 100, removeOnFail: 500 }`
- [ ] **Python worker** (`app/workers/post_analyzer.py`):
  - Consume from `post.analyze` queue
  - Processing pipeline (sequential, fail-fast on NSFW block):
    1. Download image(s)
    2. NSFW check → if score > 0.8, mark as `blocked`, skip remaining steps
    3. Generate CLIP embedding(s)
    4. Generate captions + hashtag suggestions (via LLM API or local model)
    5. Push results to `post.analyzed` queue (or callback to Node API)
  - Idempotency: check if post already has embeddings (skip if `embeddingVersion` matches current)
  - Graceful shutdown: handle SIGTERM, finish current job
- [ ] **Node consumer** for `post.analyzed` (`jobs/postAnalyzedConsumer.ts`):
  - Consume result from `post.analyzed` queue (or receive via callback)
  - Update post document: `status`, `aiCaption`, `aiHashtags`, `moderation` scores
  - If `published`: trigger `feed.fanout` job
  - If `flagged`: add to `moderation_queue`
  - Emit `post:suggestions` event to author via Socket.IO
- [ ] **Dead Letter Queue (DLQ)**:
  - Configure BullMQ to move failed jobs (exhausted retries) to a DLQ
  - Admin endpoint to view DLQ: `GET /api/v1/admin/dlq`
  - Alert mechanism: check DLQ depth on a schedule, log warnings
- [ ] **Tests**: job enqueue, worker processing (mock models), result consumption, retry on failure, DLQ behavior
- [ ] **Write ADR-007**: "Async queue between Node and Python: why and how"

### Day 26 — Content Moderation Pipeline

- [ ] **Moderation pipeline** (`app/pipelines/moderation.py`):
  - **Image moderation**:
    - Score < 0.3 → `auto_approved` → proceed to publish
    - Score 0.3–0.8 → `needs_review` → add to admin moderation queue
    - Score > 0.8 → `auto_blocked` → post stays `flagged`, notify author
  - **Text moderation** (comments, captions):
    - Run toxicity classifier
    - Score > threshold → hide comment, add to moderation queue
    - Design decision: **fail-open for text** (publish immediately, moderate retroactively)
  - Audit trail: every decision stored with model version, scores, timestamp
- [ ] **Moderation queue** (`moderation_queue` collection):
  - Fields: `targetType` (post | comment), `targetId`, `reason`, `scores`, `status` (open | approved | removed), `reviewedBy`, `reviewedAt`
- [ ] **Post status flow**: `pending_moderation` → `published` | `flagged` | `removed`
  - Update post creation to set `status: 'pending_moderation'` instead of `published`
  - Feed fan-out only triggers for `published` posts
- [ ] **Comment moderation**: enqueue `comment.moderate` job on comment creation
  - Worker runs toxicity check, updates `comment.toxicityScore`
  - If toxic: set `comment.hidden = true`, add to moderation queue
- [ ] **Admin moderation routes**:
  - `GET /api/v1/admin/moderation?status=open&cursor=` — list items needing review
  - `POST /api/v1/admin/moderation/:id/resolve` — approve or remove, with reviewer ID
  - Admin role check middleware
- [ ] **Tests**: moderation thresholds, auto-approve, auto-block, queue insertion, admin resolve flow

### Day 27 — Auto-Captions & Hashtag Suggestions

- [ ] **Caption pipeline** (`app/pipelines/captioning.py`):
  - Input: image URL(s)
  - Implementation: call a vision-capable LLM API (OpenAI GPT-4V, or free alternative like LLaVA via API)
  - Prompt: structured JSON output requesting 3 caption options + 10 ranked hashtags
  - Validate output with Pydantic; retry up to 2 times on malformed JSON
  - **Cost control**:
    - Cache results by image perceptual hash (avoid re-processing duplicate images)
    - Skip if author already provided a caption (only generate hashtag suggestions)
    - Per-user daily quota (e.g., 20 caption generations/day)
- [ ] **Hashtag grounding**:
  - After LLM generates candidate hashtags, find the nearest-neighbor posts via CLIP similarity
  - Extract hashtags from those posts
  - Merge and rank: prefer hashtags that exist in the platform's vocabulary
  - This prevents the LLM from hallucinating non-existent or misspelled hashtags
- [ ] **Suggestion delivery**:
  - Store suggestions in post document: `aiCaption`, `aiHashtags`
  - Node emits `post:suggestions { postId, captions, hashtags }` via Socket.IO to author
  - Author can accept/edit/dismiss suggestions in the UI
- [ ] **Tests**: caption generation (mock LLM), hashtag grounding, quota enforcement, caching

### Day 28 — Qdrant Vector Store Integration

- [ ] **Qdrant client wrapper** (`app/vectorstore/qdrant.py`):
  ```python
  class VectorStore:
      async def create_collection(name, vector_size, distance)
      async def upsert(collection, id, vector, payload)
      async def search(collection, query_vector, limit, filters)
      async def delete(collection, ids)
      async def get_collection_info(collection)
  ```
- [ ] **Post embeddings collection**:
  - Collection: `post_embeddings`
  - Vector size: 512 (CLIP ViT-B/32)
  - Distance: Cosine
  - Payload fields: `postId`, `authorId`, `createdAt`, `hashtags`, `visibility`, `embeddingVersion`
  - Payload indexes: `authorId`, `visibility`, `embeddingVersion`
- [ ] **Embedding storage flow**:
  - Part of the `post.analyze` pipeline: after CLIP encoding, upsert to Qdrant
  - On post deletion: delete vector from Qdrant
  - Store `embeddingVersion` on both the post document and the Qdrant payload
- [ ] **Re-index job** (`reindex` queue):
  - Admin-triggered: re-embed all posts with outdated `embeddingVersion`
  - Batch processing: 100 posts at a time
  - Can run while the system is live (old vectors remain searchable until replaced)
- [ ] **Tests**: upsert, search (with filters), delete, collection management

### Day 29 — Frontend: AI Features & Moderation Admin

- [ ] **Post creation flow update**:
  - After creating a post, show "AI is analyzing your post..." status
  - Listen for `post:suggestions` Socket.IO event
  - Display AI caption suggestions with "Use this caption" buttons
  - Display AI hashtag suggestions as toggleable chips
  - Show moderation status: pending → published (with animation) or flagged (with explanation)
- [ ] **Admin dashboard** (basic):
  - Moderation queue view: list of flagged items with scores, image preview, approve/remove buttons
  - Only accessible to admin role users
  - Display model confidence scores as visual indicators (color-coded bars)
- [ ] **Post status indicators**: show "pending review" badge on posts awaiting moderation

### Day 30 — Pipeline Reliability & Monitoring

- [ ] **Job dashboard endpoint** (`GET /api/v1/admin/queues`):
  - Show queue depths, processing rates, failed job counts for all queues
  - Using BullMQ's built-in methods: `queue.getJobCounts()`
- [ ] **Prometheus metrics** (initial setup):
  - `prom-client` in Node: HTTP request duration histogram, error counter, active connections gauge
  - Job metrics: queue depth gauge, job duration histogram, retry counter
  - Custom metrics: cache hit ratio, moderation decisions by type
  - Metrics endpoint: `GET /api/v1/metrics` (or `/metrics`)
- [ ] **Structured logging audit**:
  - Verify all logs include `requestId`
  - AI service logs include `jobId` and `postId` for traceability
  - No PII in logs (redact email, don't log passwords or tokens)
- [ ] **Error handling hardening**:
  - Worker crash recovery: BullMQ auto-retries with exponential backoff
  - Model loading failure: health endpoint reports unhealthy, Node skips AI queue
  - Network timeout to Qdrant: retry with fallback (skip vector storage, mark for re-index)
- [ ] **Pipeline latency measurement**: log timestamps at each stage (enqueue → dequeue → nsfw → embed → caption → result), calculate p50/p95

> **✅ Week 4 Exit Criteria:**
> - [ ] Uploading an image triggers async AI analysis
> - [ ] NSFW moderation auto-approves, flags, or blocks based on thresholds
> - [ ] AI-generated captions and hashtags appear in the UI via Socket.IO push
> - [ ] Embeddings are stored in Qdrant for all published posts
> - [ ] Comment toxicity detection is operational
> - [ ] Admin can review and resolve flagged content
> - [ ] DLQ captures failed jobs after retries
> - [ ] Pipeline latency is logged and measurable

---

## Week 5 — Semantic Search, Ranking & Evaluation (Days 31–37)

> **Goal:** Semantic search works with filters. Feed ranking uses embeddings. Evaluation scripts produce tables for the README.

### Day 31 — Semantic Search: Backend

- [ ] **Search service** (`app/api/search.py` in AI service):
  - `POST /search/semantic`: accept query text, optional filters (dateRange, hashtags, authorId)
  - Pipeline:
    1. Encode query text with CLIP text encoder → 512-d vector
    2. Build Qdrant filter: `visibility = 'public'`, optional author/hashtag/date filters
    3. ANN search: top-K results (K=50 for re-ranking headroom)
    4. Return: `[{ postId, score }]`
- [ ] **Node search proxy** (`modules/search/search.controller.ts`):
  - `GET /api/v1/search/semantic?q=&cursor=&hashtag=`
  - Call AI service with query
  - Hydrate results: fetch post documents, author info, interaction state
  - Apply cursor pagination on the hydrated results
  - Cache popular queries in Redis (TTL 5 min)
- [ ] **User search** (`GET /api/v1/search/users?q=`):
  - MongoDB text index on `username` + `bio`
  - Return top 20 matches with relevance score
- [ ] **Hashtag search** (`GET /api/v1/search/hashtags?q=`):
  - Aggregation pipeline on `posts.hashtags` with prefix match
  - Return hashtags with post counts
- [ ] **Tests**: semantic search returns relevant results, filters work, pagination, empty results

### Day 32 — Hybrid Search & Search Evaluation

- [ ] **Hybrid search implementation**:
  - **Vector score**: from Qdrant (CLIP cosine similarity)
  - **Text score**: from MongoDB text search on `caption` + `hashtags` (BM25-like)
  - **Reciprocal Rank Fusion (RRF)**: combine scores
    ```
    RRF_score(d) = Σ 1 / (k + rank_in_list_i)  for each list i
    ```
    where `k = 60` (standard constant)
  - Merge and re-rank results from both sources
  - Support `mode` parameter: `vector`, `text`, `hybrid` (default: hybrid)
- [ ] **Evaluation dataset** (`docs/eval/search_eval.json`):
  - Create 50–100 labeled queries with expected relevant post IDs
  - Categories: object queries ("red car"), scene queries ("sunset beach"), abstract ("happiness"), hashtag-like ("travel photography")
  - For each query, label 5–10 relevant posts from the seeded dataset
- [ ] **Evaluation script** (`scripts/eval_search.py`):
  - Run each query against all three modes (vector, text, hybrid)
  - Compute:
    - **Precision@10**: fraction of top-10 results that are relevant
    - **MRR** (Mean Reciprocal Rank): 1/rank of first relevant result, averaged
    - **NDCG@10**: normalized discounted cumulative gain
  - Output: comparison table in markdown format
  - Save to `docs/eval/search_results.md`
- [ ] **Write ADR-008**: "Hybrid search with Reciprocal Rank Fusion"

### Day 33 — User Interest Vectors

- [ ] **Interest vector computation** (`app/pipelines/interest_vector.py`):
  - For each user, compute a weighted average of CLIP embeddings of posts they:
    - Liked (weight: 1.0)
    - Saved/Bookmarked (weight: 1.5)
    - Commented on (weight: 0.5)
  - **Exponential decay**: recent interactions weighted more heavily
    ```
    weight = base_weight * exp(-λ * days_since_interaction)
    λ = 0.1 (configurable)
    ```
  - Normalize the resulting vector to unit length
  - Store in Redis: `user:interest:{userId}` → serialized 512-d float array
- [ ] **Update triggers**:
  - **Periodic batch job** (`user.vector.update` queue): recompute for all active users nightly
  - **Real-time update**: on strong signals (like, save), incrementally update the vector:
    ```
    new_vec = normalize(α * old_vec + (1-α) * new_embedding)
    α = 0.95 (slow adaptation)
    ```
- [ ] **Cold start handling**: new users with < 5 interactions → no interest vector → fall back to chronological feed
- [ ] **Tests**: vector computation correctness, exponential decay, incremental update, cold start

### Day 34 — Ranked Feed

- [ ] **Ranking service** (`modules/feed/ranking.ts`):
  - **Candidate generation**: feed_items + discovery candidates (posts from vector neighbors of interest vector, via Qdrant search with user interest vector)
  - **Feature computation** for each candidate post:
    - `recencyDecay`: `exp(-λ * hours_since_post)`, λ = 0.05
    - `authorAffinity`: normalized interaction count with this author (likes + comments + DM frequency)
    - `engagementVelocity`: `(likesCount + 2*commentsCount) / hours_since_post`
    - `embeddingSimilarity`: `cosine(userInterestVector, postEmbedding)`
  - **Score**: `w1*recencyDecay + w2*authorAffinity + w3*engagementVelocity + w4*embeddingSimilarity`
    - Default weights: `w1=0.3, w2=0.2, w3=0.2, w4=0.3` (tunable)
  - **Serving path**:
    - Fetch precomputed user interest vector from Redis
    - Fetch candidate post embeddings from Redis cache (or Qdrant batch read)
    - Compute scores in-memory (Node — all math is simple vector ops)
    - Sort and paginate
    - **Timeout**: if ranking takes > 50ms, fall back to chronological
- [ ] **Feed route update**: `GET /api/v1/feed?mode=ranked` uses ranking; `mode=chronological` is unchanged
- [ ] **Tests**: ranking score computation, weight sensitivity, timeout fallback, discovery injection

### Day 35 — Feed Ranking Evaluation

- [ ] **Synthetic user profiles** (`scripts/eval_ranking.py`):
  - Generate 200–500 synthetic users with behavioral profiles:
    - "Travel enthusiast": likes travel/nature posts
    - "Food lover": likes food/restaurant posts
    - "Tech geek": likes tech/gadget posts
    - "Art admirer": likes art/design posts
    - (10+ distinct personas)
  - Script their behavior: each persona likes/saves 50–100 posts that match their profile
  - Compute interest vectors for all synthetic users
- [ ] **Evaluation metrics**:
  - For each user, generate feeds in both modes (chronological vs ranked)
  - Simulate click-through: if the feed contains posts matching the user's profile, it's a "click"
  - Compute:
    - **Simulated like-rate**: fraction of feed items the user would like
    - **NDCG@20**: are relevant posts ranked higher?
    - **Diversity**: entropy of author distribution in top-20 (avoid filter bubbles)
  - Compare chronological vs ranked across all personas
  - Output: table in `docs/eval/ranking_results.md`
- [ ] **Honestly state** in the report that this is simulated, not real user data
- [ ] **Write ADR-009**: "Feed ranking: feature design, weights, and evaluation methodology"

### Day 36 — Frontend: Search & Ranked Feed

- [ ] **Search page** (`pages/SearchPage.tsx`):
  - Search bar with mode toggle: Text / Visual / Hybrid
  - Real-time user search with dropdown suggestions (debounced)
  - Semantic search results: grid of post images with relevance scores
  - Hashtag search: tag cloud or list with post counts
  - Search history (local storage)
  - Empty state with suggested queries
- [ ] **Feed mode toggle**:
  - Switch between "Latest" (chronological) and "For You" (ranked) at top of feed
  - Persist preference in Zustand store
  - Visual indicator of feed mode
- [ ] **Explore page enhancement**:
  - Trending posts (high engagement velocity)
  - Trending hashtags
  - "Discover" section: posts from users you don't follow but might like (based on interest vector)

### Day 37 — Integration Testing & Bug Fixing

- [ ] **End-to-end flow testing** (manual + Playwright):
  - Register → Create post → See AI suggestions → Accept caption → Post appears in feed
  - Search for post by description → Find it via semantic search
  - Follow user → Their next post appears in feed
  - Switch feed mode → Ranked feed shows different ordering
- [ ] **Performance profiling**:
  - Feed API latency with and without cache (initial measurements for k6 baseline)
  - Search latency measurement
  - Ranking computation time
- [ ] **Bug fix sprint**: address all issues found during integration testing
- [ ] **Seed script update**: ensure seed data works with all new features (embeddings, interest vectors, moderation statuses)

> **✅ Week 5 Exit Criteria:**
> - [ ] Semantic search returns relevant results for text queries on image content
> - [ ] Hybrid search outperforms keyword-only and vector-only (shown in eval table)
> - [ ] Ranked feed uses interest vectors and shows different ordering than chronological
> - [ ] Ranking evaluation table is generated with simulated metrics
> - [ ] Search evaluation table is generated with precision@10 and MRR
> - [ ] Both evaluation reports are committed to `docs/eval/`

---

## Week 6 — RAG, Testing, Deployment & Polish (Days 38–42)

> **Goal:** RAG feature works. Test coverage is solid. App is deployed, load-tested, and documented. Demo video is recorded.

### Day 38 — RAG: "Ask About This Post"

- [ ] **RAG pipeline** (`app/pipelines/rag.py`):
  - **Corpus per post**: aggregate from:
    - Post caption (original + AI-generated)
    - Hashtags
    - AI-generated image description (from captioning pipeline)
    - Top 20 comments (sorted by likes)
    - Author bio
  - **Chunking**: split corpus into overlapping chunks (~200 tokens each, 50 token overlap)
  - **Embedding**: encode chunks with a text embedding model (e.g., `all-MiniLM-L6-v2` from sentence-transformers)
  - **Retrieval**: store chunk embeddings in Qdrant (separate collection: `post_rag_chunks`) or in-memory FAISS for per-post retrieval
  - **Generation**: send top-k chunks + user question to LLM API with a grounded prompt
    - Prompt template: "Answer the question using ONLY the provided context. If the context doesn't contain the answer, say so. Cite which context snippet you used."
    - Output length cap: 300 tokens
  - **Guardrails**:
    - Prompt injection protection: user-generated text delimited with clear markers, treated as data
    - Input sanitization: strip suspicious patterns
    - Rate limit: 10 RAG queries per user per hour
- [ ] **RAG routes**:
  - `POST /api/v1/posts/:id/ask` (body: `{ question: string }`)
  - Response: `{ answer: string, sources: [{ text, type }], confidence: float }`
- [ ] **Frontend**: "Ask about this post" button on post detail page → text input → streaming answer display
- [ ] **Tests**: RAG retrieval relevance, guardrails, rate limiting, malformed input handling

### Day 39 — Test Coverage Push

- [ ] **Unit tests** (target: 70%+ coverage on core business logic):
  - **Node (`apps/api`)** — Jest:
    - Feed ranking math (score computation, weight sensitivity)
    - Cursor encoding/decoding (edge cases: first page, last page, ties)
    - Token rotation logic (generation, verification, reuse detection)
    - Moderation threshold logic
    - Cache service (get/set/invalidate)
    - Notification creation logic
  - **Python (`apps/ai-service`)** — pytest:
    - Pipeline orchestration (mock model calls)
    - Pydantic schema validation
    - Interest vector computation (math correctness)
    - RRF score computation
    - Rate limiting / quota logic
- [ ] **Integration tests** — Supertest + mongodb-memory-server:
  - Full auth flow: register → login → refresh → logout
  - Post lifecycle: create → moderate → publish → appear in feed
  - Follow → fan-out → feed read
  - Comment → toxicity check → notification
  - Like → counter update → feed score update
  - Search → results hydration
- [ ] **Contract tests**:
  - Verify all Node → Python job payloads match Pydantic schemas
  - Verify all Python → Node result payloads match Zod schemas
  - Automated: generate JSON from Zod, validate with Pydantic (and vice versa)
- [ ] **E2E tests** — Playwright (2–3 critical flows):
  - Signup → create post → see in feed
  - Search for content → find via semantic search
  - Send a DM → receive in real-time

### Day 40 — Load Testing & Performance Optimization

- [ ] **k6 load test scripts** (`loadtests/`):
  - `feed.js`: `GET /api/v1/feed` with 100/500 concurrent users, ramp-up over 2 minutes
  - `post_create.js`: `POST /api/v1/posts` with 50 concurrent users
  - `search.js`: `GET /api/v1/search/semantic` with 50 concurrent users
  - `auth.js`: login + refresh flow with 100 concurrent users
- [ ] **Baseline measurement** (before optimization):
  - Record p50/p95/p99 latency for all endpoints
  - Record error rates
  - Record Redis cache hit ratios
- [ ] **Performance optimization** (based on results):
  - Slow feed reads → verify Redis cache is working, check MongoDB explain() for index usage
  - Slow search → check Qdrant HNSW parameters, add result caching
  - High error rates → investigate connection pool exhaustion, add connection limits
  - Memory leaks → check for uncleared listeners, unbounded caches
- [ ] **After optimization**: re-run k6, record improved numbers
- [ ] **Generate performance report**: `docs/eval/performance_results.md`
  - Before/after comparison table
  - Cache hit ratio stats
  - Queue pipeline latency breakdown
- [ ] **Write ADR-010**: "Performance tuning: what we measured and what we changed"

### Day 41 — Deployment & CI/CD

- [ ] **Dockerfiles** (production-optimized):
  - `apps/api/Dockerfile`: multi-stage build, Node 20 alpine, non-root user, healthcheck
  - `apps/ai-service/Dockerfile`: multi-stage build, Python 3.11 slim, pre-download models, non-root user
  - `apps/web/Dockerfile`: build stage (Vite build) → Nginx stage for static serving
- [ ] **CD pipeline** (`.github/workflows/cd.yml`):
  - Trigger: push to `main` after CI passes
  - Build Docker images → push to registry (GHCR or DockerHub)
  - Deploy to target environment
- [ ] **Deployment target** (choose one):
  - **Option A**: AWS EC2/ECS — more complex, more "real"
  - **Option B (recommended for portfolio)**: Render (API + AI service) + Vercel (frontend) + Atlas (MongoDB) + Upstash (Redis) + Qdrant Cloud (free tier)
  - Configure environment variables in deployment platform
  - Set up custom domain (optional but impressive)
- [ ] **Production checklist**:
  - [ ] All secrets in environment variables (not in code)
  - [ ] CORS restricted to production frontend domain
  - [ ] Rate limiting active
  - [ ] HTTPS enforced
  - [ ] MongoDB Atlas IP allowlist or VPC peering
  - [ ] Sentry error tracking configured (free tier)
  - [ ] Health endpoints accessible for monitoring
- [ ] **Grafana dashboards** (`infra/grafana/`):
  - API health dashboard: request rate, latency percentiles, error rate, active connections
  - AI pipeline dashboard: queue depth, job duration, model inference latency, moderation decisions
  - Export dashboard JSON for version control
  - **Screenshot both dashboards** for the README
- [ ] **Seed production database**: run seed script with realistic demo data
- [ ] **Smoke test**: verify all critical flows work on the live deployment

### Day 42 — README, Documentation & Demo Video

- [ ] **README.md** (the most important file in the repo):
  - [ ] One-paragraph pitch at the top
  - [ ] **Demo GIF** (capture key flows — post creation, AI suggestions, semantic search, ranked feed)
  - [ ] Live URL + test credentials (read-only demo account)
  - [ ] Architecture diagram (render the ASCII diagram as a proper image, or use Mermaid)
  - [ ] Upload-to-AI sequence diagram
  - [ ] Feature list with screenshots
  - [ ] **Key design decisions** with links to ADRs
  - [ ] **Benchmarks table**: feed latency (before/after), cache hit ratio, pipeline latency
  - [ ] **Evaluation tables**: search precision@10 + MRR, ranking NDCG@20 + simulated like-rate
  - [ ] **How to run locally** — max 5 commands:
    ```bash
    git clone ...
    cp .env.example .env
    docker compose up
    npm run seed
    # Visit http://localhost:5173
    ```
  - [ ] Testing info + CI badge
  - [ ] Tech stack overview
  - [ ] Known limitations and "What I'd do at 100x scale" section
- [ ] **ADR cleanup**: ensure all 10 ADRs are written, consistently formatted, and linked from README
- [ ] **Demo video** (2–3 minutes):
  - Script: register → create post → AI analyzes and suggests captions → accept suggestion → post published → semantic search finds it → switch to ranked feed → DM another user → show admin moderation queue → show Grafana dashboard
  - Record with high-quality screen recorder
  - Upload to YouTube (unlisted) or embed in README
- [ ] **Final code cleanup**:
  - Remove all TODO comments (or convert to GitHub issues)
  - Ensure no hardcoded secrets or localhost URLs in committed code
  - Verify `.gitignore` covers all generated files, node_modules, __pycache__, .env
  - License file (MIT)
- [ ] **Resume bullets**: fill in the templates from Section 20 with real measured numbers

> **✅ Week 6 / Final Exit Criteria:**
> - [ ] App is deployed and publicly accessible with seeded demo data
> - [ ] CI is green with visible badge in README
> - [ ] Load test report and evaluation tables are committed in `docs/`
> - [ ] README is complete with architecture diagram, benchmarks, and live link
> - [ ] ADRs document all key decisions
> - [ ] Demo video is recorded and linked
> - [ ] RAG "ask about post" feature is functional
> - [ ] Test coverage is 70%+ on core business logic

---

## Architecture Decision Records (ADRs)

| ADR | Title | Week | Status |
|-----|-------|------|--------|
| ADR-001 | Why Docker Compose for local development | 0 | 🔲 |
| ADR-002 | JWT + Refresh Token Rotation with Reuse Detection | 1 | 🔲 |
| ADR-003 | Cursor-based pagination over offset | 1 | 🔲 |
| ADR-004 | Hybrid fan-out: write for normal users, read for celebrities | 2 | 🔲 |
| ADR-005 | Redis caching strategy — TTLs, invalidation, and stampede protection | 2 | 🔲 |
| ADR-006 | TTL indexes for ephemeral content (stories) | 3 | 🔲 |
| ADR-007 | Async queue between Node and Python: why and how | 4 | 🔲 |
| ADR-008 | Hybrid search with Reciprocal Rank Fusion | 5 | 🔲 |
| ADR-009 | Feed ranking: feature design, weights, and evaluation methodology | 5 | 🔲 |
| ADR-010 | Performance tuning: what we measured and what we changed | 6 | 🔲 |

---

## Quality Gates & Exit Criteria

| Phase | Gate | Verification |
|-------|------|--------------|
| Phase 0 | Dev environment boots | `docker compose up` — all services healthy |
| Week 1 | Auth is production-grade | Reuse detection test passes; rate limiting active |
| Week 1 | Core CRUD works | Register → post → follow flow tested |
| Week 2 | Feed scales to 1K users | k6 smoke test on seeded data passes |
| Week 2 | Cache is effective | Hit ratio > 60% on feed first page |
| Week 3 | Real-time works | Chat works across two browser tabs |
| Week 4 | AI pipeline is reliable | Upload → AI result within 30s (p95) |
| Week 4 | Moderation catches bad content | Test with known NSFW images, verify thresholds |
| Week 5 | Search is evaluated | Precision@10 table generated |
| Week 5 | Ranking is evaluated | NDCG@20 table generated |
| Week 6 | Deployed and documented | Live URL, green CI, complete README |

---

## Risk Tracker

| Risk | Likelihood | Impact | Mitigation | Owner | Status |
|------|-----------|--------|------------|-------|--------|
| Scope creep on AI features | High | High | Build in order: moderation → captions → search → ranking → RAG. Feature flags. | Abhishek | 🔲 Monitoring |
| Model inference too slow on CPU | Medium | Medium | Use quantized models, cache by image hash, batch processing, set quotas | Abhishek | 🔲 Monitoring |
| No data for realistic demos | High | High | Seed script with 10K+ images from open datasets (Unsplash, Open Images subset) | Abhishek | 🔲 Planned |
| BullMQ Python compatibility issues | Medium | Medium | Fallback: Option B (Node worker calls Python API). Test in Phase 0. | Abhishek | 🔲 Evaluate Day 1 |
| Free tier limits on cloud services | Medium | Low | Atlas M0 (512MB), Upstash (10K commands/day), Qdrant Cloud (1GB). Monitor usage. | Abhishek | 🔲 Monitoring |
| LLM API costs for captioning | Medium | Medium | Use free-tier (Groq, Together.ai) or local small models. Cache aggressively. Per-user quotas. | Abhishek | 🔲 Planned |
| Time overrun | High | High | Weekly exit criteria are non-negotiable. Cut from stretch list, never from tests/deploy/README. | Abhishek | 🔲 Active |

---

## Dependency Map

```
Phase 0 (Setup)
    └── Week 1 (Auth + CRUD + Follow)
          └── Week 2 (Feed + Cache + Likes + Comments)
                ├── Week 3 (Real-Time + Stories + Frontend Polish)
                │     └── Independent of Week 4 AI work
                └── Week 4 (AI Service + Moderation Pipeline)
                      └── Week 5 (Search + Ranking + Evaluation)
                            └── Week 6 (RAG + Testing + Deploy + Docs)
```

> **Key insight:** Week 3 (real-time) and Week 4 (AI) can partially overlap if ahead of schedule. Week 3 frontend work is independent of AI service development.

---

## Resume Metrics Collection Plan

> Collect these measurements as you build. Don't retroactively guess numbers.

| Metric | When to Measure | Tool | Target Location |
|--------|----------------|------|-----------------|
| Feed p50/p95/p99 latency (before cache) | Week 2, Day 13 | k6 | `docs/eval/performance_results.md` |
| Feed p50/p95/p99 latency (after cache) | Week 2, Day 14 | k6 | `docs/eval/performance_results.md` |
| Cache hit ratio (feed, post, user) | Week 2, Day 14 | Redis counters | `docs/eval/performance_results.md` |
| AI pipeline latency (upload → published) | Week 4, Day 30 | Logs (timestamp diff) | `docs/eval/performance_results.md` |
| Search precision@10, MRR (3 modes) | Week 5, Day 32 | `eval_search.py` | `docs/eval/search_results.md` |
| Ranking NDCG@20, simulated like-rate | Week 5, Day 35 | `eval_ranking.py` | `docs/eval/ranking_results.md` |
| Moderation precision/recall | Week 4, Day 26 | pytest + labeled set | `docs/eval/moderation_results.md` |
| Test coverage % | Week 6, Day 39 | Jest --coverage, pytest --cov | CI badge in README |
| Feed p50/p95/p99 under 500 concurrent | Week 6, Day 40 | k6 | `docs/eval/performance_results.md` |
| Queue retry success rate | Week 4, Day 30 | BullMQ metrics | `docs/eval/performance_results.md` |

---

## Daily Standup Template

Use this to track progress each day:

```markdown
## Day X — [Date]

### Done
- [ ] Task 1
- [ ] Task 2

### Blocked
- Issue description → action to unblock

### Tomorrow
- Next priority tasks

### Metrics collected today
- (any measurements taken)
```

---

> **IMPORTANT:** The #1 rule: If a week slips, cut from the stretch list (near-duplicate detection, OAuth, push notifications), **never** from tests, deployment, or the README. A deployed, tested, documented project with fewer features beats a feature-rich project that only runs on localhost.

> **TIP:** Commit frequently with descriptive messages. Each day should have 3–5 commits minimum. This shows consistent effort and makes it easy to demonstrate the development process in interviews.
