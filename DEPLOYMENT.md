# Deploying Novak (Railway + Vercel)

```
Browser ──► Vercel (web, static SPA)
              │  /api/*  rewrite (same origin, so the refresh cookie is first-party)
              ▼
            Railway: api  ◄──── Socket.IO (direct, VITE_SOCKET_URL)
              │  private network
              ├──► MongoDB   ├──► Redis   └──► ai-service ──► Qdrant
```

Total time: about 20 minutes. Do Railway first, because Vercel needs the API URL.

---

## 1. Railway

Create a project, then add these services in order.

### 1a. Databases

1. **MongoDB**: *New → Database → MongoDB*.
2. **Redis**: *New → Database → Redis*.
3. **Qdrant** (vector search; optional but recommended). Pick one:
   - *New → Docker Image →* `qdrant/qdrant:v1.19.1`. Add a volume at `/qdrant/storage` and the variable `QDRANT__SERVICE__HOST=::` (so it listens on Railway's IPv6 private network). Name the service `qdrant`.
   - Or a free cluster on [Qdrant Cloud](https://cloud.qdrant.io). Keep its URL and API key for step 1b.

### 1b. `ai-service`

*New → GitHub Repo →* this repo. Rename the service to `ai-service`, then go to **Settings**:

| Setting | Value |
|---|---|
| Root Directory | *(leave empty: the Dockerfile builds from the repo root)* |
| Config-as-code / Railway Config File | `/apps/ai-service/railway.json` |
| Public networking | none needed (only the API calls it) |

**Variables:**

```env
AI_ENV=production
PORT=8000
INTERNAL_API_SECRET=<random, 32+ chars>   # openssl rand -base64 48
# Railway Qdrant service:
QDRANT_URL=http://${{qdrant.RAILWAY_PRIVATE_DOMAIN}}:6333
# ...or Qdrant Cloud instead:
# QDRANT_URL=https://xxxx.cloud.qdrant.io:6333
# QDRANT_API_KEY=<key>

# Real AI (CLIP embeddings, semantic search, AI image tags). Needs ~1.5 GB RAM.
# Leave unset for a lightweight service: moderation still runs, search uses keywords.
WITH_CLIP=true
```

### 1c. `api`

*New → GitHub Repo →* the same repo again. Rename it to `api`, then go to **Settings**:

| Setting | Value |
|---|---|
| Root Directory | *(leave empty)* |
| Railway Config File | `/apps/api/railway.json` |
| Public networking | **Generate Domain** (e.g. `novak-api.up.railway.app`) |

**Variables** (the `${{...}}` references resolve automatically):

```env
NODE_ENV=production
MONGO_URI=${{MongoDB.MONGO_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
AI_SERVICE_URL=http://${{ai-service.RAILWAY_PRIVATE_DOMAIN}}:${{ai-service.PORT}}
INTERNAL_API_SECRET=${{ai-service.INTERNAL_API_SECRET}}
JWT_ACCESS_SECRET=<random, 32+ chars>
JWT_REFRESH_SECRET=<a different random value, 32+ chars>
# Your Vercel URL(s). Fill these in after step 2; the wildcard covers preview deploys.
CORS_ORIGIN=https://novak.vercel.app,https://novak-*.vercel.app
COOKIE_SAMESITE=lax
# Vercel's proxy + Railway's edge = 2 hops; makes rate limiting see real client IPs
TRUST_PROXY=2
```

The API refuses to start in production if a secret is missing or shorter than 32 characters. That's deliberate.

**Check it:** `https://<api-domain>/api/health` should return `"database":"healthy","cache":"healthy"`.

---

## 2. Vercel

1. In `apps/web/vercel.json`, replace `REPLACE-WITH-YOUR-API.up.railway.app` with your API domain from step 1c. Commit and push.
2. *Add New → Project →* import this repo.
   - **Root Directory:** `apps/web`. Keep "Include files outside the root directory" enabled.
   - Framework, install and build commands come from `vercel.json`; don't override them.
3. **Environment variables:**
   ```env
   VITE_SOCKET_URL=https://<api-domain>        # realtime updates (Vercel can't proxy WebSockets)
   # Optional file uploads, see section 3:
   VITE_CLOUDINARY_CLOUD_NAME=<cloud name>
   VITE_CLOUDINARY_UPLOAD_PRESET=<unsigned preset>
   ```
   Leave `VITE_API_URL` **unset**: the app calls `/api`, which the rewrite forwards to Railway.
4. Deploy. Then put the final Vercel URL into the API's `CORS_ORIGIN` on Railway; the API redeploys by itself.

`VITE_*` variables are baked in at build time. After changing one, redeploy the Vercel project.

---

## 3. Optional: image uploads (Cloudinary)

Without this, posts take a public `https://` image URL. To let users upload files:

1. Create a free Cloudinary account.
2. *Settings → Upload → Upload presets → Add*, with Signing mode **Unsigned**. Restrict it to images, and set a max file size if you like.
3. Set `VITE_CLOUDINARY_CLOUD_NAME` and `VITE_CLOUDINARY_UPLOAD_PRESET` on Vercel and redeploy.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| API deploy fails its healthcheck | `/api/health` needs Mongo **and** Redis. Check `MONGO_URI` / `REDIS_URL`, then look in the deploy logs for `Invalid environment configuration`. |
| Login works but you're signed out after a reload | The refresh cookie isn't reaching the API. Leave `VITE_API_URL` unset and check the `vercel.json` rewrite domain. |
| `CORS policy violation` | Add the exact Vercel origin (no trailing slash) to `CORS_ORIGIN`. |
| Posts stay "AI analyzing" | The API can't reach ai-service. Check `AI_SERVICE_URL`, that `PORT=8000` is set on ai-service, and its logs. Jobs retry with backoff for about 2.5 minutes. |
| Every post ends up "Under review" (CLIP on) | The image host blocks downloads, or the URL isn't a direct image link. Use Cloudinary uploads. |
| Search says "Keyword match" | Expected without `WITH_CLIP=true` or Qdrant. Check `GET /health` on ai-service for the component status. |
| Realtime status updates don't arrive | Set `VITE_SOCKET_URL` on Vercel and redeploy. The page origin must be in `CORS_ORIGIN`. |

## Local development

```bash
cp .env.example .env
npm install
npm run infra:up        # Mongo, Redis, Qdrant in Docker
npm run dev             # contracts + API (:3000) + web (:5173)
npm run dev:ai          # optional, needs a Python env with apps/ai-service/requirements.txt
```

Full stack in containers, as production builds: `npm run infra:all`, then open http://localhost.
