# Lumen — AI-Native Social Platform

Lumen is an Instagram-scale, AI-native social platform built with a high-performance modern stack (MERN + FastAPI + Qdrant + Redis/BullMQ). It integrates async computer vision pipelines (CLIP), semantic search, intelligent feed ranking, automated toxicity & NSFW moderation, and real-time social interactions.

## Architecture Highlights
- **Apps/Web**: Modern React 18 + Vite + TypeScript + Tailwind CSS UI with dark-mode aesthetic, glassmorphic design, and optimistic updates.
- **Apps/Api**: Modular Node.js + Express + TypeScript monolith backend with MongoDB (Mongoose), Redis caching, BullMQ job queues, and WebSocket (Socket.IO) real-time events.
- **Apps/AI-Service**: Python 3.11 + FastAPI microservice powering OpenCLIP embeddings, zero-shot classification, toxicity moderation, and Qdrant vector indexing.
- **Packages/Contracts**: Centralized Zod schemas & shared TypeScript contracts for request/response validation across services.
- **Infra**: Docker Compose setup for MongoDB, Redis, Qdrant vector database, and Nginx reverse proxy.

## Quickstart

```bash
# 1. Clone & copy environment variables
cp .env.example .env

# 2. Spin up infrastructure (MongoDB, Redis, Qdrant)
npm run infra:up

# 3. Install dependencies
npm install

# 4. Start local development
npm run dev
```

## Directory Structure

```
lumen/
  ├── apps/
  │   ├── web/          # React + Vite + TypeScript + Tailwind
  │   ├── api/          # Node.js + Express + TypeScript
  │   └── ai-service/   # Python 3.11 + FastAPI + CLIP + Qdrant
  ├── packages/
  │   └── contracts/    # Shared Zod schemas & API envelopes
  ├── infra/            # Docker Compose & Nginx configuration
  ├── docs/
  │   └── adr/          # Architecture Decision Records
  └── .github/          # CI/CD Workflows
```
