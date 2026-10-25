# Novak

**A photo-sharing app where posts are searchable by what their captions mean, not just the words they use.**

Search **"ocean animals"** and Novak returns *"Walruses napping on the beach"* and *"Orange jellyfish
drifting through the blue at the aquarium"*. Neither caption contains "ocean" or "animal".

![Explore: the query "ocean animals" returns a walrus post and a jellyfish post with similarity scores 0.64 and 0.63, then a keyword match](docs/images/explore-search.jpg)

Novak is a full-stack project focused on the parts of backend and AI engineering that are easy to
skip in a demo: work that keeps going when a dependency fails, search quality measured against a
baseline, and AI features described for exactly what they do.

- **For users:** post a photo with a caption, scroll a feed, like posts, and find posts by meaning
  in Explore. Authors see each post's processing state update live.
- **What's technically interesting:**
  - **Publishing never waits on AI.** A BullMQ worker analyses posts in the background, and a
    reconciler re-drives any job lost to a Redis or AI-service outage. Every step is idempotent and
    covered by integration tests against real MongoDB and Redis.
  - **Hybrid search, measured.** Embedding hits above a tuned similarity floor come first, then
    MongoDB `$text` matches. On a labelled set: **nDCG@10 0.84 vs 0.49** for the keyword search it
    replaced (0.81 vs 0.30 on paraphrased queries).
  - **One source of truth for visibility.** Search results are hydrated from MongoDB through the
    same filter as the feed, so the vector index can't leak a hidden post.
- **Try it locally:** one Docker command, then a demo-data script ([Quickstart](#quickstart)).
  There is no public deployment yet.

## Contents

[Features and status](#features-and-status) · [How it works](#how-it-works) · [Results](#results) ·
[Tech stack](#tech-stack) · [Quickstart](#quickstart) · [Tests](#tests) · [Configuration](#configuration) ·
[Troubleshooting](#troubleshooting) · [Limitations](#security-notes-and-known-limitations) · [Docs](#docs)

## Features and status

| Capability | Implemented | Tested | Measured |
|---|---|---|---|
| Sign-up/login: argon2id, 15-min JWT, rotating refresh cookie with reuse detection | ✅ | integration | – |
| Posts, keyset-paginated feed, profiles, idempotent likes | ✅ | integration | [latency](docs/BENCHMARKS.md) |
| Background analysis: retries with backoff, terminal failure, author retry, reconciler | ✅ | integration (real Redis) | [throughput](docs/BENCHMARKS.md) |
| Caption embeddings (bge-small) in Qdrant; hybrid semantic + keyword search | ✅ | unit, contract, e2e | [quality](docs/SEARCH_EVAL.md), latency |
| Live processing status over Socket.IO, with reconnect re-fetch and polling fallback | ✅ | unit | – |
| Caption screening: **keyword rules** that flag for review only | ✅ | unit | not evaluated |
| Image understanding / image moderation | ❌ not implemented | – | – |
| Comments, follows, personalised ranking | ❌ not implemented | – | – |
| Public deployment | config only ([DEPLOYMENT.md](DEPLOYMENT.md)) | – | – |

<p align="center"><img src="docs/images/feed.jpg" alt="Feed: a post of a pug wrapped in a blanket, with author tag #pug and AI tags #dog, #pets, #wildlife; sidebar with trending tags" width="820"></p>

## How it works

```mermaid
flowchart LR
  B[React SPA] -->|REST + Socket.IO| A[Express API]
  A --> M[(MongoDB)]
  A -->|jobId = postId| R[(Redis / BullMQ)]
  R --> W[Worker] -->|analyze-post| S[FastAPI AI service]
  A -->|search| S
  S <--> Q[(Qdrant)]
  W --> M
```

1. **Publish:** the API saves the post with `processingStatus: pending` and returns 201. The post
   is visible straight away. Queueing the job takes at most 2 s, and fails fast if Redis is down.
2. **Analyse:** the worker sends the caption and tags to the AI service. It checks the caption
   against keyword rules, embeds it with `BAAI/bge-small-en-v1.5` (384 dimensions, ONNX on CPU),
   adds zero-shot topic tags, and upserts the vector into Qdrant under an id derived from the post id.
3. **Record:** the worker marks the post `completed` (only if it isn't already) and pushes
   `post:processed` to the author. Transient errors retry with exponential backoff (5 s → 80 s).
   After 6 attempts, or on a 4xx, the post becomes `failed` and the author gets a Retry button.
   A failure is never recorded as moderation approval.
4. **Recover:** every 60 s, the reconciler compares pending posts in MongoDB with BullMQ. It
   re-enqueues lost jobs and records failures the worker didn't get to write.
5. **Discover:** `/api/search` queries Qdrant (cosine ≥ 0.62) and MongoDB `$text` in parallel,
   hydrates the ids from MongoDB with the viewer's visibility filter, and lists semantic hits first.
   If one side fails, the other's results are returned and the response says which (`mode`).

Details: [ARCHITECTURE.md](docs/ARCHITECTURE.md) (failure-mode table, indexes, pagination, auth),
and [ADR-003](docs/adr/ADR-003-reconciler-over-outbox.md) for why a reconciler instead of an outbox.

## Results

### Search quality

From the [full report](docs/SEARCH_EVAL.md): 62 captions and 36 hand-labelled queries. The
similarity threshold was chosen on a dev split and reported on a held-out split.

| System | nDCG@10 (all) | nDCG@10 (paraphrase queries) | Recall@5 | No-answer queries returning results |
|---|---|---|---|---|
| MongoDB `$text` (previous behaviour) | 0.494 | 0.303 | 0.508 | 1 / 6 |
| Semantic only, no floor | 0.920 | 0.914 | 0.886 | 6 / 6 |
| **Hybrid (shipped)** | **0.842** | **0.811** | **0.817** | 2 / 6 |

The dataset is small and I wrote it myself; the report lists where the model fails (e.g. "live
music" ranks *"Listening to the storm…"* first). CI fails if search quality drops below set floors.

### Performance

From the [full report](docs/BENCHMARKS.md). One laptop (Ryzen 5 5600H) ran every service and the
load generator, so treat these as relative numbers.

| Endpoint | p50 / p95, concurrency 1 | p50 / p95, concurrency 10 | Errors |
|---|---|---|---|
| `POST /api/posts` | 28 / 35 ms | 197 / 354 ms | 0% |
| `GET /api/posts/feed` | 6 / 8 ms | 52 / 66 ms (189 req/s) | 0% |
| `GET /api/search` (hybrid) | 35 / 55 ms | 172 / 249 ms | 0% |

- 300 posts were fully analysed and indexed 7.9 s after the last one was created (~21 posts/s).
- Feed queries read exactly the documents they return (`SORT_MERGE` over index ranges, no in-memory sort).

## Tech stack

| Layer | Technology |
|---|---|
| Web | React 18, TypeScript, Vite, TanStack Query, Zustand, Tailwind CSS, Socket.IO client |
| API | Node.js 20, Express 4, TypeScript, Mongoose 8, Zod, BullMQ 5, Socket.IO (Redis adapter), Pino |
| AI service | Python 3.11, FastAPI, FastEmbed (ONNX Runtime), `BAAI/bge-small-en-v1.5`, qdrant-client |
| Data | MongoDB 7, Redis 7, Qdrant 1.19 |
| Shared | `@novak/contracts`: Zod schemas plus JSON fixtures checked by both the TypeScript and Python tests |
| Tooling | Vitest, Testing Library, supertest, pytest, ruff, Docker Compose, nginx, GitHub Actions |

## Quickstart

### Option A: everything in Docker (recommended)

Prerequisites: Docker Desktop (or Docker Engine with Compose v2) and about 4 GB of free RAM.

```bash
git clone https://github.com/abhishekkamble12/Novak.git && cd Novak
docker compose -f infra/docker-compose.yml --profile app up -d --build --wait
node scripts/seed-demo.mjs        # optional: 12 demo posts with matching photos and captions
```

Open **http://localhost** and try Explore with *"ocean animals"*, *"morning coffee"* or
*"cooking dinner"*. The demo account is `novak_demo` / `DemoPassw0rd`.

| URL | What |
|---|---|
| **http://localhost** | Web app through the nginx gateway (serves the SPA, proxies `/api` and `/socket.io`) |
| http://localhost:3000/api/health | API readiness, including the analysis backlog |
| http://localhost:8000/health | AI service: model and Qdrant status |
| http://localhost:6333/dashboard | Qdrant dashboard |

- Use port 80, not 5173: in this setup 5173 serves only the static build, without the API proxy.
- The first build bakes the ~67 MB embedding model into the AI image, so it takes a few minutes.
- No `.env` is needed for Docker. To customise, `cp .env.example .env`.
- Stop with `docker compose -f infra/docker-compose.yml --profile app down`. Data is kept in volumes.

### Option B: local development

Prerequisites: Node 20.11+ (see `.nvmrc`), npm 10, Python 3.11+, and Docker (for MongoDB, Redis and Qdrant).

```bash
cp .env.example .env
npm install
npm run infra:up                                   # MongoDB, Redis, Qdrant in Docker

cd apps/ai-service && python -m venv .venv
source .venv/bin/activate                          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt && cd ../..

npm run dev        # terminal 1: contracts watcher + API (:3000) + web (:5173, proxies /api)
npm run dev:ai     # terminal 2: AI service (:8000), with the venv active
node scripts/seed-demo.mjs --base http://localhost:5173/api    # optional demo data
```

Image uploads are optional: set `VITE_CLOUDINARY_CLOUD_NAME` and `VITE_CLOUDINARY_UPLOAD_PRESET`
(an unsigned preset). Without them, posts take a public `https://` image URL. No other external
accounts or API keys are needed.

## Tests

| Command | What it covers | Needs |
|---|---|---|
| `npm test` | API unit and cross-language contract tests (10); web tests for loading, error, empty and success states, processing badges, cache sync, and the misrouted-API guard (15) | nothing |
| `npm run test:integration` | 36 API tests: refresh rotation and reuse, visibility on every read path, pagination with timestamp ties, concurrent likes, BullMQ retries, terminal failures, duplicate delivery, reconciler, Redis outage, hybrid-search hydration and partial failure | `npm run infra:up` |
| `npm run test:ai` | 27 pytest tests: caption rules (including the old false positives), 503 on model or Qdrant failure, score floor, internal auth, contract fixtures | Python venv |
| `npm run eval:search` | Search evaluation; add `-- --check` to enforce the quality floors | venv (+ MongoDB for the `$text` baseline) |
| `npm run smoke` | Full journey against a running stack: publish → analyse → paraphrase search → visibility → like → delete | running stack |
| `npm run bench` | Load test ([method](docs/BENCHMARKS.md)) | running stack, `RATE_LIMIT_ENABLED=false` |

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs everything except the benchmark:
integration tests against MongoDB and Redis service containers, the search-quality gate, and a
Docker Compose build followed by the smoke test.

## Configuration

Every variable is documented in [`.env.example`](.env.example). The ones that matter:

| Variable | Default | Required in production? |
|---|---|---|
| `MONGO_URI`, `MONGO_DB_NAME`, `REDIS_URL` | local Docker | yes |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `INTERNAL_API_SECRET` | dev placeholders | **yes**: random, 32+ characters; the API refuses to start otherwise |
| `CORS_ORIGIN`, `COOKIE_SAMESITE`, `TRUST_PROXY` | localhost / `lax` / 1 | set for your hosting |
| `AI_SERVICE_URL` | `http://localhost:8000` | yes |
| `ENABLE_WORKER`, `RECONCILE_INTERVAL_MS`, `RECONCILE_STALE_MS` | `true`, 60 s, 60 s | optional |
| `RATE_LIMIT_ENABLED` | `true` | keep `true` |
| `QDRANT_HOST`, `QDRANT_PORT`, `QDRANT_COLLECTION_POSTS` | `127.0.0.1`, 6333, `novak_posts_v2` | yes (AI service) |
| `EMBED_MODEL_NAME`, `SEARCH_MIN_SCORE` | bge-small, 0.62 | optional; re-run the eval if you change the model |
| `VITE_API_URL`, `VITE_SOCKET_URL`, `VITE_CLOUDINARY_*` | empty | optional |

Deploying to Railway and Vercel: [DEPLOYMENT.md](DEPLOYMENT.md).

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "The server returned something other than the Novak API" | `/api` isn't reaching the API. With Docker, open http://localhost (the gateway), not :5173 |
| Explore says "Keyword results only" | The AI service is down or its model didn't load: `curl localhost:8000/health` |
| Posts stay "Processing" | Check `curl localhost:3000/api/health`. If `pipeline.pendingPosts` keeps growing, the API can't reach the AI service or Qdrant; posts are retried, then marked failed |
| `Integration tests need MongoDB and Redis` | Run `npm run infra:up`, or set `TEST_MONGO_URI` / `TEST_REDIS_URL` |
| API exits with `Invalid environment configuration` in production | A secret is missing, too short, or still a placeholder from `.env.example` |
| Port already in use | Another MongoDB, Redis or Qdrant is running; stop it or change the ports in `infra/docker-compose.yml` |
| Slow first AI start (local dev) | It's downloading the embedding model (~67 MB) into `apps/ai-service/.cache` |

## Security notes and known limitations

- **Caption screening is a keyword list, not a model.** It catches a few explicit and spam phrases
  and holds matches for review (hidden from others; the author sees why). Its recall has never been
  measured. It doesn't look at images, and nothing sets the `rejected` status yet.
- **Optimistic publishing:** a post is public before its caption is screened. That's usually a few
  seconds, longer if the AI service is down. The trade-off keeps posting available.
- **Search reads captions only.** A photo with no caption or tags is never semantically searchable.
  The model is small and English-centric; known failure cases are in [SEARCH_EVAL.md](docs/SEARCH_EVAL.md).
- The AI service trusts its network, plus the `X-Internal-Secret` header when `AI_ENV=production`.
  Don't expose it publicly.
- Image URLs are user-supplied and served as-is: there's no media proxy or upload scanning.
- **Accepted advisory:** Zod 3 is affected by [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
  (validation issues pile up per invalid array element; fixed only in Zod 4). The 100 kB body limit
  bounds it: the worst request that fits (50,000 invalid tags) costs about 45 ms of CPU and 16 MB of
  short-lived heap, and requests are rate-limited per IP. Migrating to Zod 4 changes `.default()`
  semantics across all three packages, so it's a planned change rather than a hotfix.
- The worker and reconciler run inside the API process. That's fine at this size; at larger scale
  they'd be split out ([ARCHITECTURE.md](docs/ARCHITECTURE.md#what-id-change-at-larger-scale)).

## Repository layout

```
apps/api             Express + TypeScript: routes, Mongoose models, BullMQ worker, reconciler
  test/integration   supertest suites against real MongoDB + Redis
  scripts/           explain-queries.ts (MongoDB query plans for the hot paths)
apps/ai-service      FastAPI: caption rules, FastEmbed embedder, zero-shot tagger, Qdrant store
  eval/              labelled dataset, evaluation script, results.json
  tests/             pytest
apps/web             React 18 + Vite + TanStack Query + Tailwind
packages/contracts   Zod schemas shared by API and web, plus cross-language fixtures
infra/               Docker Compose (data stores + full stack) and the nginx gateway
scripts/             bench.mjs (load test), smoke.mjs (end-to-end check), seed-demo.mjs (demo data)
docs/                architecture, API, search evaluation, benchmarks, ADRs, screenshots
```

## Docs

- [Architecture](docs/ARCHITECTURE.md): components, post lifecycle, failure handling, indexes, auth
- [API reference](docs/API.md)
- [Search evaluation](docs/SEARCH_EVAL.md): dataset, baselines, threshold choice, failure cases
- [Benchmarks](docs/BENCHMARKS.md): method, environment, results, query plans
- [Deployment](DEPLOYMENT.md): Railway + Vercel
- ADRs: [001 Docker Compose for local dev](docs/adr/ADR-001-docker-compose-local-dev.md) ·
  [002 Async AI pipeline](docs/adr/ADR-002-async-ai-pipeline.md) ·
  [003 Reconciler over outbox](docs/adr/ADR-003-reconciler-over-outbox.md)

Demo photos are from [Unsplash](https://unsplash.com), served by [Lorem Picsum](https://picsum.photos).

## License

[MIT](LICENSE) © 2026 Abhishek Kamble
