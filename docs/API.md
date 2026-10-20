# API reference

Base path `/api`. Every response uses one envelope:

```json
{ "success": true,  "data": { }, "meta": { "timestamp": "…", "cursor": "…", "hasMore": true } }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [ ] }, "meta": { "requestId": "…" } }
```

Authenticated routes need `Authorization: Bearer <accessToken>`. Request and response schemas
are Zod schemas in `packages/contracts`, shared by the API and the web app.

## Auth

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | `{username, email, password, name}` → 201 `{user, accessToken}`, sets the refresh cookie. 409 if taken |
| POST | `/auth/login` | `{emailOrUsername, password}` → 200, or 401 (same message for unknown users) |
| POST | `/auth/refresh` | Uses the httpOnly cookie; rotates it. Replaying an old token → 401 `REFRESH_TOKEN_REUSE`, and the session is revoked |
| POST | `/auth/logout` | Revokes the session |
| GET | `/auth/me` | Current user |

Login and register are limited to 15 requests per 15 min per IP; everything else to 300.

## Posts

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/posts/feed?limit=1..50&cursor=` | optional | Newest first, keyset pagination. Signed-in users also see their own flagged posts |
| POST | `/posts` | required | `{caption?, mediaUrl (https), tags?}` → 201 with `processingStatus: "pending"` |
| GET | `/posts/:id` | optional | 400 for a malformed id, 404 if missing **or not visible to you** |
| DELETE | `/posts/:id` | author | 403 for non-authors; also deletes the vector |
| POST | `/posts/:id/reprocess` | author | Only when `processingStatus` is `failed` (else 409) → 202, back to pending |
| POST | `/posts/:id/like` | required | Idempotent → `{liked: true, likesCount}` |
| DELETE | `/posts/:id/like` | required | Idempotent |
| GET | `/posts/trending-tags` | none | Top tags among approved posts of the last 7 days |

`PostDto` fields worth knowing:

| Field | Values |
|---|---|
| `processingStatus` | `pending` → `completed` or `failed`. Background analysis state |
| `searchIndexed` | `true` once the caption embedding is stored in Qdrant |
| `moderationStatus` | `pending` (not screened yet, or analysis failed), `approved`, `flagged` (hidden from others; author sees `moderationReason`), `rejected` (reserved for human review, nothing sets it) |
| `aiTags` | Caption hashtags plus zero-shot topic tags from the embedding |
| `score` | Search only: cosine similarity for semantic hits (not a probability) |

## Users

| Method | Path | Notes |
|---|---|---|
| GET | `/users/:username` | Profile |
| GET | `/users/:username/posts?limit&cursor` | Same pagination and visibility as the feed |
| PATCH | `/users/me` | `{name?, bio?, avatarUrl?}` |
| GET | `/users/suggestions` | Up to 5 users with posts |

## Search

`GET /search?q=<1..200 chars>&tag=&limit=1..50` → `{results: PostDto[], mode: "hybrid" | "semantic" | "keyword", latencyMs}`.
`hybrid`: semantic hits (with `score`) then keyword matches. `keyword`: the AI service was unavailable.
`semantic`: the keyword query failed. Both failing → 503 `SEARCH_UNAVAILABLE`.

## Health

| Path | Meaning |
|---|---|
| `/health/live` | Process is up (used by the container HEALTHCHECK); includes RSS and CPU time |
| `/health` | 200 if MongoDB and Redis are reachable, else 503. `pipeline.queue` = BullMQ counts, `pipeline.pendingPosts` = analysis backlog |

## Socket.IO

Connect with `auth: { token: accessToken }`. The server sends `post:processed`
`{postId, moderationStatus, moderationReason?, processingStatus, searchIndexed, aiTags}` to the
author's room only. Delivery is best-effort; the client re-fetches after a reconnect.

## AI service (internal)

Called only by the API; requires the `X-Internal-Secret` header when `AI_ENV=production`.

| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/analyze-post` | Screen, embed, tag and upsert. 503 if it should index but can't (the caller retries) |
| POST | `/api/v1/search` | `{query, limit, filterTag?}` → `{results: [{postId, score}], minScore, …}` |
| DELETE | `/api/v1/posts/:id` | Remove a vector |
| POST | `/api/v1/moderate` | Caption keyword screening only; there is no image moderation |
| GET | `/health` | `healthy`, or `degraded` if Qdrant or the model is unavailable |
