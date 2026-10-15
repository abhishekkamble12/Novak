# Lumen — AI-Native Multimodal Social Platform

Lumen is an Instagram-scale, AI-native social platform designed with a high-performance distributed architecture. It integrates asynchronous computer vision pipelines (OpenCLIP), semantic visual search, intelligent feed ranking, automated toxicity & NSFW moderation guardrails, and real-time social interactions.

---

## 🏛️ System Architecture

```
                                 ┌────────────────────────┐
                                 │   Browser Client (Web) │
                                 │ React 18 + Vite + TS   │
                                 └───────────┬────────────┘
                                             │ HTTP & WebSocket
                                             ▼
                                 ┌────────────────────────┐
                                 │      Nginx Proxy       │
                                 │     (Port 80/443)      │
                                 └─────┬────────────┬─────┘
                     /api, /socket.io  │            │  Static SPA
                                       ▼            ▼
                   ┌───────────────────────┐   ┌───────────────────────┐
                   │    Node Express API   │   │     Web Container     │
                   │  (Port 3000, Monolith)│   │  (Port 80, SPA Nginx) │
                   └───────────┬───────────┘   └───────────────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────────────┐
│    MongoDB 7     │ │  Redis 7 Cache   │ │   FastAPI AI Service     │
│ (Primary Store)  │ │   & Job Queue    │ │ (OpenCLIP + Moderation)  │
│  Port: 27017     │ │    Port: 6379    │ │       Port: 8000         │
└──────────────────┘ └─────────┬────────┘ └────────────┬─────────────┘
                               │ BullMQ Job            │
                               └───────────────────────┘
                                                       │ Vectors (512-dim)
                                                       ▼
                                          ┌──────────────────────────┐
                                          │  Qdrant Vector Engine    │
                                          │     Port: 6333/6334      │
                                          └──────────────────────────┘
```

---

## ✨ Features & Capabilities

- **Multimodal Semantic Search**: Natural language query search powered by 512-dimensional OpenCLIP embeddings and Qdrant ANN cosine distance indexing.
- **Asynchronous AI Pipeline**: Non-blocking post creation (<50ms p95 latency) decoupling user uploads from heavy computer vision inference via Redis and BullMQ.
- **Automated Content Guardrails**: Text toxicity, hate speech, spam, and visual safety moderation pre-filtering before vector indexing.
- **Modern Dark Aesthetic**: Sleek glassmorphism, responsive navigation (desktop sidebar & mobile bottom bar), and double-tap micro-animations.
- **Shared Type Safety**: Monorepo contracts (`@lumen/contracts`) enforcing Zod request/response validation across both TypeScript and Python services.
- **Production-Ready Infra**: Multi-stage Dockerfiles, Docker Compose profiles, health checks, Redis connection pooling with fail-fast degradation, and automated CI.

---

## 📁 Repository Structure

```
lumen/
├── apps/
│   ├── web/                     # React 18 + Vite + TypeScript + Tailwind CSS
│   │   ├── src/components/      # UI components (Navbar, PostCard, StoriesBar, CreatePostModal)
│   │   ├── src/pages/           # FeedPage, ExplorePage, AuthPage
│   │   ├── src/lib/             # Axios client with JWT auth interceptors
│   │   ├── src/store/           # Zustand state management
│   │   └── Dockerfile           # Multi-stage container (deps, dev, build, prod)
│   ├── api/                     # Node.js + Express + TypeScript API
│   │   ├── src/config/          # Zod env, Mongoose pool, Redis fail-fast, Pino logger
│   │   ├── src/middleware/      # Auth (JWT), rate limiting, error handler, Zod validator
│   │   ├── src/modules/         # Domain modules (health, auth, posts, feed)
│   │   ├── src/utils/           # Response envelopes, base64 cursor pagination, AppError
│   │   └── server.ts            # HTTP bootstrap & Socket.IO Redis adapter
│   └── ai-service/              # Python 3.11 + FastAPI Machine Learning Microservice
│       ├── app/api/             # Inference routes (/moderate, /embed, /analyze-post, /search)
│       ├── app/models/          # OpenCLIP model loader & safety moderation engine
│       ├── app/vectorstore/     # Qdrant client wrapper (query_points, upsert)
│       └── app/schemas/         # Pydantic models with camelCase alias compatibility
├── packages/
│   └── contracts/               # Shared Zod schemas & TypeScript type definitions
├── infra/
│   ├── docker-compose.yml       # Production/base container definitions (mongo, redis, qdrant)
│   ├── docker-compose.override.yml # Local development hot-reload volume overrides
│   └── nginx/                   # Reverse proxy configuration
├── docs/
│   └── adr/                     # Architecture Decision Records (ADR-001, ADR-002)
├── .github/workflows/           # GitHub Actions CI (lint, typecheck, build validation)
├── .env.example                 # Documented environment template
└── package.json                 # Monorepo workspaces configuration
```

---

## 🚀 Quickstart Guide

### 1. Prerequisites
Ensure you have the following installed on your machine:
- **Node.js**: `v20.11.0` or higher (`v20` recommended, see `.nvmrc`)
- **npm**: `v10.0.0` or higher
- **Python**: `3.11+` (with `pip` and virtual environment support)
- **Docker & Docker Compose**: Docker Desktop / Docker Engine

### 2. Clone & Setup Environment
```bash
# 1. Clone repository
git clone https://github.com/<your-username>/lumen.git
cd lumen

# 2. Create local environment file
cp .env.example .env
```

### 3. Spin Up Infrastructure (MongoDB, Redis, Qdrant)
Run persistent data stores in the background:
```bash
npm run infra:up
```
> *Note: This command runs with Docker Compose profiles so only data stores (MongoDB, Redis, Qdrant) are started, preventing local port collisions.*

### 4. Install Dependencies
```bash
# Install root, contracts, web, and API dependencies
npm install

# Build shared contracts package
npm run build --workspace=@lumen/contracts
```

For the Python AI service:
```bash
cd apps/ai-service
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
cd ../..
```

### 5. Start Local Development Servers
Run the full local stack:
```bash
# Terminal 1: Launches contracts watcher, Node API, and Web frontend concurrently
npm run dev

# Terminal 2: Launches FastAPI AI microservice with hot reloading
npm run dev:ai
```

---

## 🌐 Service Ports & Routing Table

| Service | Local URL | Container Port | Description |
|---|---|---|---|
| **Web Frontend** | `http://localhost:5173` | `80` (prod) / `5173` (dev) | React 18 SPA |
| **Node API** | `http://localhost:3000` | `3000` | Express core REST & WebSockets |
| **API Health** | `http://localhost:3000/api/health` | `3000` | Checks MongoDB & Redis connectivity |
| **FastAPI Service** | `http://localhost:8000` | `8000` | CLIP inference & Qdrant bridge |
| **AI Health** | `http://localhost:8000/health` | `8000` | Checks Qdrant & model status |
| **Qdrant Dashboard** | `http://localhost:6333/dashboard` | `6333` | Vector collection explorer |
| **MongoDB** | `mongodb://localhost:27017/lumen` | `27017` | Document database |
| **Redis** | `redis://localhost:6379` | `6379` | Cache & BullMQ message broker |
| **Nginx (Proxy)** | `http://localhost:80` | `80` | Production gateway |

---

## 🐳 Full Containerized Stack

If you prefer to run the entire application inside Docker containers (including Web, API, and AI service):

```bash
# Start all 7 services (infrastructure + application containers)
npm run infra:all

# View streaming logs
npm run infra:logs

# Stop all containers
npm run infra:down
```

---

## 📜 Available NPM Scripts

| Command | Action |
|---|---|
| `npm run dev` | Runs contracts compiler, Node API, and Vite web client concurrently |
| `npm run dev:ai` | Starts Python FastAPI AI service with hot-reload (`uvicorn`) |
| `npm run build` | Builds contracts, API, and Web SPA distribution bundles |
| `npm run typecheck` | Runs TypeScript type checking across contracts, API, and Web |
| `npm run infra:up` | Starts persistent data stores (`mongo`, `redis`, `qdrant`) |
| `npm run infra:all` | Starts all services via Docker Compose with dev overrides |
| `npm run infra:down` | Stops and cleans up Docker containers |
| `npm run infra:logs` | Streams live logs from all running Docker services |

---

## 🔬 AI Pipeline & Semantic Search

1. **Post Ingestion**: User publishes media with caption → API records post as `moderationStatus: 'pending'` and enqueues `PostAnalyzeJob` to BullMQ.
2. **Safety Moderation**: Content is evaluated by regex word-boundary guardrails and toxicity models (`apps/ai-service/app/models/moderation.py`).
3. **Multimodal Embeddings**: OpenCLIP extracts a 512-dimensional normalized feature vector from the text and image.
4. **Vector Indexing**: The vector is upserted into Qdrant (`lumen_posts_v1` collection) alongside author metadata and discoverable tags.
5. **Real-Time Notification**: Status is updated in MongoDB and pushed to the client via Socket.IO (`post:processed`).
6. **Semantic Querying**: Queries in Explore (`POST /api/v1/search`) are vectorized into the same latent space and queried against Qdrant using cosine similarity (`query_points`).

---

## 📚 Architecture Decision Records (ADRs)

- [ADR-001: Docker Compose for Local Development](file:///d:/Novak/docs/adr/ADR-001-docker-compose-local-dev.md)
- [ADR-002: Asynchronous AI Pipeline via BullMQ & Redis](file:///d:/Novak/docs/adr/ADR-002-async-ai-pipeline.md)

---

## 🛡️ License

MIT License © 2026 Abhishek Kamble
