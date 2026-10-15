# Lumen — Senior Engineering Audit & Upgrade Plan

**Audited commit:** `a236b44` (feat: complete Phase 0 monorepo scaffold)
**Date:** 2026-10-15
**Scope:** every tracked file: `apps/api`, `apps/web`, `apps/ai-service`, `packages/contracts`, `infra/`, CI, docs

---

## 1. Verdict

The structure is good: a monorepo with a typed contracts package, a Zod-validated env, an error envelope, graceful shutdown, ADRs and a detailed plan. That is above average for a Phase 0.

**But Phase 0 is not actually done.** The plan's exit gate is *"`docker compose up` — all services healthy"*, and right now:

| Check | Result | How I verified |
|---|---|---|
| `npm ci` (what CI runs) | ❌ **fails**: no `package-lock.json` committed | `git ls-files` |
| `npm run build -w @lumen/web` | ❌ **fails**: 4 TypeScript errors | ran it on a clean copy |
| `ruff check apps/ai-service` (CI) | ❌ **fails**: 5 errors | ran it |
| CI Docker build of ai-service | ❌ **fails**: wrong build context | read Dockerfile + ci.yml |
| `docker compose up` → qdrant healthy | ❌ **never**: image has no `curl`/`wget` | `docker run qdrant/qdrant:latest` |
| → ai-service starts | ❌ **never** (it waits on qdrant being healthy) | follows from the row above |
| Dev override for `web` | ❌ **crash-loops**: runs `npm` inside an `nginx:alpine` image | `docker run nginx:alpine` has no node |
| Semantic search returns results | ❌ **always `[]`**: `QdrantClient.search()` was removed in qdrant-client ≥1.16 (1.19.1 installed) | installed it and checked |
| `npm run dev` starts api + web | ❌ only the API starts (workspace scripts run one after another, and `tsx watch` never exits) | npm semantics |
| `npm run typecheck` contracts + api | ✅ passes | ran it |
| `npm run build -w @lumen/api` and boot | ✅ compiles and boots (retries DB in the background) | ran it |

**Bottom line:** 9 blockers stand between you and a green CI with a stack that boots. All of them are small; most are one-line fixes. Fixing them is the first section below. After that come correctness bugs, security issues and structural improvements, ordered by priority.

**Severity legend:** 🔴 P0 = broken now · 🟠 P1 = wrong behavior / latent bug · 🟡 P2 = security / reliability hardening · 🔵 P3 = DX & architecture improvement

---

## 2. 🔴 P0 — Make it work (blockers)

### P0-1. No lockfile → CI `npm ci` fails immediately
`ci.yml` runs `npm ci` and `cache: 'npm'`, and both require `package-lock.json`. It is not committed.

**Fix**
```bash
npm install            # generates package-lock.json
git add package-lock.json
```
Also pin the Node version so local (you have Node 22) and CI (Node 20) match:
```jsonc
// package.json (root)
"engines": { "node": ">=20.11 <23" },
"packageManager": "npm@10.9.2"
```
and add a `.nvmrc` containing `20`. Then use `node-version-file: .nvmrc` in CI.

### P0-2. Web build fails (4 TypeScript errors)
```
src/components/feed/CreatePostModal.tsx(2,32): TS6133 'ImageIcon' is declared but never read
src/components/feed/PostCard.tsx(65,19):       TS2322 Property 'title' does not exist on LucideProps
src/lib/api.ts(4,24):                          TS2339 Property 'env' does not exist on type 'ImportMeta'
src/pages/ExplorePage.tsx(74,10):              TS6133 'isSearching' is declared but never read
```
**Fixes**
1. Create `apps/web/src/vite-env.d.ts`:
   ```ts
   /// <reference types="vite/client" />
   interface ImportMetaEnv {
     readonly VITE_API_URL?: string;
     readonly VITE_SOCKET_URL?: string;
     readonly VITE_ENABLE_MOCK?: string;
   }
   interface ImportMeta { readonly env: ImportMetaEnv }
   ```
2. `CreatePostModal.tsx`: remove `Image as ImageIcon` from the import.
3. `PostCard.tsx`: lucide icons don't accept `title`. Wrap the icon instead:
   ```tsx
   <span title="Content verified safe by AI Moderation">
     <ShieldCheck className="w-4 h-4 text-emerald-400" aria-label="Verified safe" />
   </span>
   ```
4. `ExplorePage.tsx`: either use `isSearching` (e.g. disable the button / show a spinner) or drop the state.

### P0-3. Ruff fails in CI (5 × F401 unused imports)
`config.py` (`os`), `clip_loader.py` (`Optional`, `torch` inside `load_model`), `moderation.py` (`List`), `contracts.py` (`HttpUrl`).

**Fix:** `ruff check apps/ai-service --fix`. For the intentional `import torch` probe in `load_model`, keep it with `# noqa: F401` or remove it (open_clip imports torch anyway).

Add a `[tool.ruff]` section to `pyproject.toml` so the rules are explicit:
```toml
[tool.ruff]
target-version = "py311"
line-length = 110
[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP", "ASYNC"]
```

### P0-4. CI builds the AI image with the wrong context
`ci.yml` uses `context: apps/ai-service`, but the Dockerfile does `COPY apps/ai-service/requirements.txt`, which only resolves from the repo root (and that's what compose uses).

**Fix (ci.yml):**
```yaml
- name: Build AI Service Docker Image
  uses: docker/build-push-action@v6
  with:
    context: .
    file: apps/ai-service/Dockerfile
    push: false
    cache-from: type=gha
    cache-to: type=gha,mode=max
```
Also add a third step that builds `apps/web/Dockerfile`. The web image is not built in CI today.

### P0-5. Qdrant healthcheck can never pass → ai-service never starts
`qdrant/qdrant` images contain neither `curl` nor `wget`, so `["CMD","curl",...]` always fails. `ai-service` has `depends_on: qdrant: condition: service_healthy`, so it stays in `Created` forever.

**Fix:** use bash's `/dev/tcp`. I tested this inside the image and it returns `HTTP/1.0 200 OK`:
```yaml
qdrant:
  image: qdrant/qdrant:v1.19.2          # pin it, see P1-1
  healthcheck:
    test: ["CMD-SHELL", "bash -c 'exec 3<>/dev/tcp/127.0.0.1/6333 && printf \"GET /readyz HTTP/1.0\\r\\n\\r\\n\" >&3 && grep -q \"200 OK\" <&3'"]
    interval: 10s
    timeout: 5s
    retries: 10
    start_period: 10s
```

### P0-6. Dev override for `web` runs `npm` in an nginx image
`apps/web/Dockerfile` ends in `FROM nginx:alpine`, which has no Node. The override then sets `command: npm run dev ...`, so the container crash-loops. The ports are also wrong: compose maps `5173:80`, but Vite listens on 5173.

**Fix:** add a named `dev` stage to the web Dockerfile and target it from the override:
```dockerfile
# apps/web/Dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/web/package.json ./apps/web/
RUN npm ci

FROM deps AS dev
COPY packages/contracts ./packages/contracts
COPY apps/web ./apps/web
EXPOSE 5173
CMD ["npm", "run", "dev", "--workspace=@lumen/web", "--", "--host", "0.0.0.0"]

FROM deps AS build
COPY packages/contracts ./packages/contracts
COPY apps/web ./apps/web
RUN npm run build -w @lumen/contracts && npm run build -w @lumen/web

FROM nginx:1.27-alpine AS prod
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
```
```yaml
# infra/docker-compose.override.yml
web:
  build: { target: dev }
  ports: ["5173:5173"]
```
Same for `api`: the override mounts source and runs `tsx watch`, but the image it reuses is the prod build. Give it a `dev` target too. Note that in dev mode nginx's `web:80` upstream also has to point at `web:5173`.

### P0-7. Semantic search silently always returns `[]`
`requirements.txt` has `qdrant-client>=1.9.1` (unpinned), which installs **1.19.1**. In that version `QdrantClient.search` no longer exists (`'search' in dir(QdrantClient)` → `False`). The `AttributeError` is swallowed by `except Exception` and returns `[]`.

**Fix** (`vectorstore/qdrant.py`):
```python
res = self.client.query_points(
    collection_name=settings.QDRANT_COLLECTION_POSTS,
    query=vector,
    limit=limit,
    offset=offset,
    query_filter=qfilter,          # build from filter_tag, see P1-7
    with_payload=True,
)
return [{"post_id": p.payload.get("post_id", str(p.id)), "score": p.score, "payload": p.payload}
        for p in res.points]
```
**Lesson:** this is exactly why you pin Python deps. See P1-1.

### P0-8. `npm run dev` only starts the API
`npm run dev --workspaces` runs each workspace's script one after another. `apps/api`'s `tsx watch` never exits, so `apps/web` never starts. `packages/contracts`' `tsc --watch` would block the same way.

**Fix:** run them in parallel:
```bash
npm i -D concurrently -w .   # root dev dependency
```
```jsonc
// root package.json
"scripts": {
  "dev": "concurrently -n contracts,api,web,ai -c gray,blue,magenta,green \"npm:dev -w @lumen/contracts\" \"npm:dev -w @lumen/api\" \"npm:dev -w @lumen/web\" \"npm:dev:ai\"",
  "dev:ai": "cd apps/ai-service && uvicorn app.main:app --reload --port 8000",
  "infra:up": "docker compose -f infra/docker-compose.yml up -d mongo redis qdrant"
}
```
(Turborepo is the bigger alternative and also gives you build caching. Either is fine.)

### P0-9. README quickstart collides with itself
- `npm run infra:up` = `docker compose -f infra/docker-compose.yml up -d`. That starts **all 7 services** (api, web, ai-service, nginx included), not just "MongoDB, Redis, Qdrant" as the README says. Then `npm run dev` hits `EADDRINUSE` on 3000/5173.
- Passing `-f` explicitly means `docker-compose.override.yml` is **not** auto-loaded, so the hot-reload override never applies through the npm script.

**Fix:** use compose **profiles**: data stores have no profile, app services get `profiles: ["app"]`:
```yaml
api:        { profiles: ["app"], ... }
ai-service: { profiles: ["app"], ... }
web:        { profiles: ["app"], ... }
nginx:      { profiles: ["app"], ... }
```
- `npm run infra:up` → only mongo/redis/qdrant (run apps locally with `npm run dev`)
- `docker compose -f infra/docker-compose.yml -f infra/docker-compose.override.yml --profile app up` → full containerized dev stack

Also delete `version: '3.8'` from both compose files (compose warns that it's obsolete).

### P0-10. Root `.env` is never loaded
`.env.example` says "copy to `.env`" at the repo root. But:
- npm workspace scripts run with `cwd = apps/api`, so `dotenv.config()` looks for `apps/api/.env`.
- Vite reads `apps/web/.env*` only.
- pydantic-settings reads `.env` relative to the uvicorn cwd.

Today it only *appears* to work because the hard-coded defaults match `.env.example`.

**Fix (pick one):**
- API: `dotenv.config({ path: path.resolve(__dirname, "../../../.env") })`, or better, Node 20.6+ `node --env-file=../../.env` / `tsx --env-file=../../.env watch src/server.ts`.
- Web: in `vite.config.ts` set `envDir: path.resolve(__dirname, "../..")`.
- AI: `model_config = SettingsConfigDict(env_file=("../../.env", ".env"), extra="ignore")`.
- Compose: add `env_file: ../.env` to `api` and `ai-service`, and remove the hard-coded secrets from `docker-compose.yml`.

---

## 3. 🟠 P1 — Correctness bugs (works, but wrong)

### P1-1. Unpinned dependencies everywhere
- Python: every requirement is `>=`. Use a lock: **`uv`** (`uv lock` / `uv sync`) or `pip-tools` (`pip-compile`). Delete the duplicated list in `requirements.txt`, or generate it from `pyproject.toml`.
- Docker: `qdrant/qdrant:latest` and `nginx:alpine`. Pin them (`qdrant/qdrant:v1.19.2`, `nginx:1.27-alpine`). The Qdrant server and client **must** stay version-compatible.
- `multer@1.x` is deprecated with known vulnerabilities (npm warns on install). Move to `multer@^2`.

### P1-2. Redis with `maxRetriesPerRequest: null` makes the whole API hang when Redis is down
`config/redis.ts` sets `maxRetriesPerRequest: null`. That's required **for BullMQ connections only**. On the shared client it means every command queues forever while Redis is down. As a result:
- `GET /api/health` hangs instead of reporting `cache: "unreachable"`.
- **Every request hangs**, because `globalRateLimiter` calls Redis on every hit.

**Fix:** two clients.
```ts
// app cache / rate limit / health: fail fast
export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, enableOfflineQueue: false, ... });
// BullMQ only
export const createBullConnection = () => new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
```
Wrap the health ping in a timeout (`Promise.race` with 1s), and set `passOnStoreError: true` on the rate limiters so a Redis outage degrades to "no rate limit" instead of a 500 or a hang.

### P1-3. Rate limiting behind nginx groups all users into one bucket
In Docker, all traffic arrives from the nginx container IP, so 300 req/15 min is **shared by every user**. express-rate-limit v7 also emits `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`.

**Fix:** `app.set("trust proxy", 1);` in `createApp()`. Also exclude `/api/health` from the global limiter (Docker/k8s probes would otherwise eat the quota):
```ts
skip: (req) => req.path === "/api/health",
```

### P1-4. `connectDB` boot logic
- On failure it schedules a retry but `bootstrap()` continues and the server starts listening anyway. OK for dev, but then `/health` returns 503 with no clear signal.
- Every retry **re-registers** the `disconnected`/`reconnected` listeners, which leaks listeners and logs duplicates.
- There is no `error` listener.

**Fix:** register the listeners once, outside the function. Retry in a loop with backoff and a cap, then `await` it (or decide explicitly that the API should boot degraded, and document it).

### P1-5. CORS rejection becomes a 500
`callback(new Error("CORS policy violation"))` → `errorHandler` treats it as an unhandled exception → 500 plus an error-level log with a stack trace. Throw `new ForbiddenError("Origin not allowed")` instead (→ 403). Also, `env.NODE_ENV === "development"` allows **any** origin **with credentials**. Prefer an explicit allow-list in dev too (`localhost:5173`, `localhost`).

### P1-6. Text moderation has false positives and rejects innocent posts
`moderation.py` uses substring matching: `"kill" in "learning new skills"` → `True` → `hate_speech` → **rejected**. Likewise `hate` in "whatever", `attack` in "heart attack", `nude` in "nudes"/"denuded" and so on.

**Fix now:** word-boundary regex (`re.search(rf"\b{re.escape(term)}\b", text, re.I)`).
**Fix properly (Week 4 plan):** a real classifier, e.g. `unitary/toxic-bert` or Detoxify for text, plus a CLIP zero-shot or an NSFW classifier on the image. Keep the keyword list only as a cheap pre-filter.

### P1-7. AI service is "AI" in name only right now
- `torch` / `open-clip-torch` are **not** in `requirements.txt` → `load_model()` always fails → every embedding is a **hash-seeded random vector**. Search results are therefore random. Yet `/health` still reports `"status": "healthy"`.
- `/embed` with `image_url` embeds the **URL string as text** (`get_text_embedding(payload.image_url)`). It never downloads the image.
- `/analyze-post` never looks at the image either. It uses caption text only.
- `/moderate` → `evaluate_image()` always returns "approved".
- `/search` ignores `offset` and `filter_tag`.
- `author_username` is never written to the Qdrant payload, so every result says `"user"`.
- Mock vectors and real CLIP vectors can end up in the **same collection** if the model fails to load on one replica. That silently corrupts the index.

**Fixes:**
1. Add an `ai` extra install to the Docker image (CPU torch wheel: `--index-url https://download.pytorch.org/whl/cpu`) and pre-download weights at build time so startup doesn't hit the network.
2. Add `fetch_image(url)` with `httpx` (timeout, max size such as 10 MB, content-type check, **SSRF guard**: reject private/loopback IPs) → `PIL.Image` → `get_image_embedding`.
3. Store `embedding_model` + `model_version` in each point's payload; **refuse to upsert mock vectors** unless `AI_ENV=development` and `ALLOW_MOCK_EMBEDDINGS=true`.
4. Make `/health` report `degraded` when in fallback mode, and add a separate `/ready` endpoint.
5. Pass `author_username` in `PostAnalyzePayload` and build a `Filter(must=[FieldCondition(key="tags", match=MatchValue(value=tag))])` for `filter_tag`. Create a payload index on `tags` and `author_id`.

### P1-8. Blocking work inside `async def` endpoints freezes the event loop
All inference routes are `async def`, but they call **synchronous** torch and the synchronous `QdrantClient`. One slow request stalls every other request, including `/health`.
**Fix:** declare them as plain `def` (FastAPI runs those in a threadpool), or use `await run_in_threadpool(...)` together with `AsyncQdrantClient`.

### P1-9. Contract drift: TS (camelCase) vs Python (snake_case)
`packages/contracts` says `postId`, `imageUrl`, `latencyMs`. The Python models say `post_id`, `image_url`, `latency_ms`. Nothing enforces that they match. Also, the TS `ModerationResponseSchema` has no `reason` field, while Python's does.
**Fix:** in Python, use `model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)` and serialize `by_alias=True`. Then add a contract test: generate JSON Schema from Zod (`zod-to-json-schema`) and validate FastAPI's OpenAPI against it in CI.
Also, `@lumen/contracts` is a dependency of api and web but **neither imports it**. `apps/web/src/types/index.ts` re-declares `User`/`Post` by hand. Import the types from contracts.

### P1-10. Contracts package resolution in dev
`@lumen/contracts` points `main` at `dist/index.js`, so it only works **after** `npm run build -w @lumen/contracts`. As soon as the API imports it, a fresh clone running `npm run dev` crashes.
**Fix:** add `"exports"` with a `"development"`/`"types"` condition pointing at `src/index.ts` (tsx and Vite can consume TS directly), or add a root `"predev": "npm run build -w @lumen/contracts"`.

### P1-11. Web SPA deep links 404 in production
The prod web image uses nginx's default config, which has no `try_files`. Refreshing `/explore` gives a 404.
**Fix:** `apps/web/nginx.conf`:
```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
  location / { try_files $uri /index.html; }
}
```

### P1-12. Reverse proxy issues (`infra/nginx/nginx.conf`)
- `/api/` sets `Connection 'upgrade'` on **every** request, which breaks upstream keep-alive. Use the standard `map $http_upgrade $connection_upgrade { default upgrade; '' close; }`.
- No `client_max_body_size`. The default 1 MB will reject image uploads once multer lands (Day 5). Set `10m`.
- `X-Forwarded-Proto` is missing (needed for secure cookies later).
- The `ai_service` upstream is declared but unused. That's good (it shouldn't be public), so delete it to avoid accidentally exposing it.
- `/socket.io/` needs `proxy_read_timeout 3600s;` or long-polling and websockets drop after 60s.

### P1-13. Frontend is fully mocked, and some of it misrepresents itself
- `useAuthStore` boots **already authenticated** as a hard-coded demo user with token `"demo-token"`.
- `AuthPage` "logs in" without calling an API.
- `App.handleCreatePost` only `console.log`s.
- `CreatePostModal` shows *"Passed AI Moderation"* from a client-side `includes("hate")` check.
- `ExplorePage` prints *"Qdrant vector query latency: ~14ms"* as a hard-coded string.
- Navbar links to `/messages`, `/notifications`, `/profile`, which don't exist and silently redirect to `/`.
- `PostCard` keeps its own `isLiked`/`likesCount` state **and** the parent toggles `hasLiked`, so there are two sources of truth that will drift once data refetches.
- `index.html` references `/vite.svg`, which doesn't exist (404 favicon).

Mocks are fine for a scaffold, but put them behind `VITE_ENABLE_MOCK` (already in `.env.example`, currently unused). Never display fake metrics or fake "AI passed" states. In a demo or interview, a reviewer who opens devtools will see straight through it.

---

## 4. 🟡 P2 — Security & reliability hardening

| # | Issue | Fix |
|---|---|---|
| S1 | JWT secrets have **defaults** in `env.ts`, so production can boot with `development-access-secret...` | In prod require `z.string().min(32)` with no default: `.superRefine` on `NODE_ENV === "production"` |
| S2 | `jwt.verify` has no algorithm pinning, and the payload is cast blindly | `jwt.verify(token, secret, { algorithms: ["HS256"], issuer: "lumen-api", audience: "lumen-web" })` then validate the payload with Zod |
| S3 | Access token in `localStorage` (readable by XSS) | Access token in memory (zustand, not persisted) plus refresh token in an `httpOnly; Secure; SameSite=Strict` cookie scoped to `/api/auth/refresh`, with rotation and reuse detection (already in the Day 4 plan, so keep it) |
| S4 | AI service auth only runs when `AI_ENV == "production"`; the header name (`X-Api-Secret`) and the env var names (`AI_SERVICE_API_KEY` vs `INTERNAL_API_SECRET`) don't match; comparison is `!=` | Always enforce. Use one name (`INTERNAL_API_SECRET`) in both services and one header (`X-Internal-Secret`). Compare with `hmac.compare_digest` |
| S5 | AI service has `CORS allow_origins=["*"]` **with** `allow_credentials=True` | It's an internal service: remove CORS entirely, and don't publish port 8000 outside dev |
| S6 | Mongo / Redis / Qdrant published on host ports with no auth | Fine for local dev. Bind them to `127.0.0.1:27017:27017` etc., and in any shared env set `requirepass` (Redis), Mongo root user, `QDRANT__SERVICE__API_KEY` |
| S7 | Containers run as root; no `.dockerignore` | Add `USER node` / `USER app`. Add `.dockerignore` (`node_modules`, `dist`, `.env*`, `.git`, `__pycache__`, `.venv`). Without it, local `node_modules` (Windows-native `argon2` binaries!) gets copied into Linux images by `COPY apps/api` |
| S8 | Image URL fetching (once implemented) = SSRF vector | Allow-list your Cloudinary domain, or resolve DNS and reject private ranges; enforce a size limit and timeout |
| S9 | `errorHandler` returns the stack trace in `development` | OK, but make sure `NODE_ENV=production` is set in the prod compose (it's `development` today) |
| S10 | No request IDs | `pino-http` `genReqId` → `X-Request-Id` header, put it in `meta.requestId` (the envelope already has the field) and forward it to the AI service |
| S11 | Docker `api` / `ai-service` have no healthchecks (the plan says they do) | Add healthchecks (`wget -qO- localhost:3000/api/health` for node:alpine; python one-liner for ai-service), and make `nginx` depend on them `service_healthy` |
| S12 | Graceful shutdown: `subClient` (redis duplicate) never closed; double SIGINT runs shutdown twice; `setTimeout` keeps the process alive | Track an `isShuttingDown` flag, close `subClient`, `.unref()` the force-exit timer |
| S13 | `.gitignore` misses `.env.*` variants (`.env.production`) | Add `.env.*` and `!.env.example` |

---

## 5. 🔵 P3 — Developer experience & architecture

1. **Lint and test tooling is declared but missing.** `apps/api` has `"lint": "eslint"` and `"test": "jest"`, `apps/web` has `"lint": "eslint"`, but **neither ESLint nor Jest is installed or configured**. Root `npm run lint`/`npm test` will fail.
   - Add a root `eslint.config.js` (flat config, `typescript-eslint`, `eslint-plugin-react-hooks`) and Prettier config.
   - Use **Vitest** instead of Jest for both api and web. It shares Vite config, has native ESM/TS support and needs zero config. Add `supertest` for API routes and `mongodb-memory-server` for integration tests.
   - Python: `pytest` + `pytest-asyncio` + `httpx.AsyncClient`. Write tests for moderation (including the "skills" false-positive regression), the fallback embedding determinism and the search endpoint with a mocked Qdrant.
2. **CI upgrades:** run tests; run `npm run lint`; use `concurrency:` to cancel superseded runs; add a `docker compose up --wait` smoke job that curls `/api/health` and `/health` (this is literally your Phase 0 exit gate, so automate it); add Dependabot or Renovate; add `npm audit --omit=dev` and `pip-audit`.
3. **Pre-commit hooks:** `husky` + `lint-staged` (eslint/prettier on staged files) and `pre-commit` for ruff. This catches the P0-2/P0-3 class of errors before they reach CI.
4. **Python logging:** replace `print(...)` with `logging`, or better `structlog` with JSON output, so logs line up with pino's JSON logs. Use `model_config = SettingsConfigDict(...)` instead of the pydantic-v1-style `class Config` (deprecation warning).
5. **AI Docker image:** drop `build-essential` (not needed for these wheels; ~250 MB). Use a multi-stage build with `uv`, and run as non-root. `VECTOR_DIM` should come from the loaded model (`model.visual.output_dim`), not a constant.
6. **API structure for Week 1+:** keep the `modules/<feature>/{routes,controller,service,model,schema}.ts` pattern you started with `health`. Add an `asyncHandler` wrapper (or move to Express 5, which forwards rejected promises natively; note that `validate.ts` assigning `req.query` breaks on Express 5, so store parsed values on `res.locals` instead).
7. **Remove unused deps until needed:** `argon2`, `bullmq`, `cloudinary`, `multer` are installed but unused. They add install time and native-build risk (argon2 on Windows/Alpine) now. Re-add them on the day they're used.
8. **Observability (Week 4 to 6):** `/metrics` with `prom-client` (API) and `prometheus-fastapi-instrumentator` (AI), BullMQ queue depth gauges, OpenTelemetry trace propagation API → BullMQ → AI service. This is what produces the "resume metrics" the plan wants.
9. **Housekeeping:** rename `impleme_plan.md` → `docs/IMPLEMENTATION_PLAN.md`; move `project.md` → `docs/`. Update the README quickstart after P0-8/P0-9 (it should state prerequisites: Node 20, Python 3.11, Docker). Add a `Makefile` or `justfile` with `make up`, `make dev`, `make test`, `make lint`.
10. **Correct the plan's checkmarks.** Phase 0 Day 1 claims healthchecks on `api` and `ai-service` (they don't exist), and the exit criterion is marked ✅ while `docker compose up` doesn't reach healthy. Un-tick until the smoke job (P3-2) is green, so that the plan stays a trustworthy source of truth.

---

## 6. Step-by-step: from current state to 100% green (≈ 1 working day)

Do these in order. Each step is independently committable.

| Step | Action | Done when |
|---|---|---|
| 1 | Add `.nvmrc`, `engines`, `.dockerignore`, `.gitignore` additions | files exist |
| 2 | `npm install` → commit `package-lock.json` | `npm ci` succeeds |
| 3 | Fix the 4 web TS errors (P0-2) | `npm run build -w @lumen/web` ✅ |
| 4 | `ruff check --fix`, add `[tool.ruff]` (P0-3) | `ruff check apps/ai-service` ✅ |
| 5 | Pin Python deps with `uv lock`; replace `search` with `query_points` (P0-7, P1-1) | `/api/v1/search` returns hits after an `/analyze-post` |
| 6 | Compose: remove `version`, pin images, qdrant healthcheck, profiles, `env_file`, api + ai healthchecks (P0-5, P0-9, P0-10, S11) | `docker compose up -d --wait` → mongo/redis/qdrant healthy |
| 7 | Multi-stage Dockerfiles with `dev` targets; fix override (P0-6) | `docker compose ... --profile app up --wait` → all healthy |
| 8 | `concurrently` dev script; env loading from root `.env` (P0-8, P0-10) | `npm run dev` serves `:5173` and `:3000/api/health` returns 200 |
| 9 | Split Redis clients, `trust proxy`, health skip, CORS 403 (P1-2, P1-3, P1-5) | stopping redis → `/api/health` returns 503 within 1s instead of hanging |
| 10 | CI: fix AI context, build web image, add compose smoke job (P0-4, P3-2) | GitHub Actions all green |
| 11 | Add ESLint + Vitest + pytest with ≥1 test per service (P3-1) | `npm test` and `pytest` green in CI |
| 12 | SPA nginx config + proxy fixes (P1-11, P1-12) | refresh on `/explore` works via `http://localhost` |
| 13 | Prod-required secrets, JWT algorithm pinning, AI secret always enforced (S1, S2, S4) | booting with `NODE_ENV=production` and no secrets exits with a clear error |

After step 13, Phase 0 genuinely meets its exit gate and you can start Week 1 (auth) on a solid base.

---

## 7. Making it *better*: priorities for the roadmap

These are the improvements I'd prioritize over adding more surface area:

1. **End-to-end vertical slice first.** Before stories, chat and RAG, make one real flow: register → login → upload image → `POST /posts` → BullMQ job → AI service (real CLIP on the image, real moderation) → Qdrant upsert → Mongo update → `post:processed` socket event → shows in feed → findable via Explore search. One real slice is worth more than ten mocked screens, in a portfolio and in an interview.
2. **Pick the Node↔Python bridge now (the plan's open risk).** Recommendation: **Node BullMQ worker → HTTP call to FastAPI** (the plan's "Option B"). The Python BullMQ port is less mature, and HTTP keeps the AI service stateless, testable and horizontally scalable. Make the call idempotent (Qdrant point ID = uuid5(postId), already done 👍) and give the job retries with exponential backoff plus a dead-letter queue.
3. **Make AI honest and measurable.** A seed script (Unsplash/COCO subset of a few thousand images) plus a small labeled query set gives you a real Precision@10 / NDCG table. That is the strongest artifact this project can produce.
4. **Hybrid search.** Combine Qdrant dense vectors with Mongo text search (or Qdrant sparse/BM25 vectors) using reciprocal-rank fusion. Pure CLIP fails on usernames, exact hashtags and other proper nouns.
5. **Feed caching by design, not by default.** Fan-out-on-write into Redis sorted sets for normal users, fan-out-on-read for celebrities, as planned. Write a k6 script early so every change has a number attached.
6. **Media pipeline.** Direct-to-Cloudinary signed uploads from the browser (the API only signs), blurhash placeholders and `srcset` responsive images. Don't stream image bytes through Express or multer.
7. **Deploy early.** Ship the skeleton to a free tier (Render/Fly + Atlas M0 + Upstash + Qdrant Cloud) in Week 1, not Day 41. Most environment and config bugs (like P0-10) surface only in a real deployment.

---

### Appendix: commands used for verification
```bash
git archive HEAD | tar -x -C <scratch>      # clean copy, no local state
npm install
npm run typecheck -w @lumen/contracts       # ✅
npm run typecheck -w @lumen/api             # ✅
npm run build -w @lumen/web                 # ❌ 4 errors (P0-2)
npm run build -w @lumen/contracts && npm run build -w @lumen/api && node apps/api/dist/server.js   # ✅ boots
python -m ruff check apps/ai-service        # ❌ 5 errors (P0-3)
docker run --rm --entrypoint sh qdrant/qdrant:latest -c 'command -v curl'   # (none) → P0-5
docker run --rm --entrypoint sh nginx:alpine -c 'command -v node'           # (none) → P0-6
pip install qdrant-client && python -c "from qdrant_client import QdrantClient; print(hasattr(QdrantClient,'search'))"  # False → P0-7
```
