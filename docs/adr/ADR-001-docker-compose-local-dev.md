# ADR-001: Docker Compose for Local Development Infrastructure

## Status
Accepted

## Date
2026-10-15

## Context
Novak comprises multiple heterogeneous services:
1. Node.js Express API service
2. Python FastAPI AI service with machine learning dependencies (FastEmbed, Qdrant client)
3. React Vite frontend
4. Data stores: MongoDB 7, Redis 7 (cache & message queue), and Qdrant (vector search engine)
5. Nginx reverse proxy

Developers and evaluators need a reproducible, zero-friction environment where running a single command (`npm run infra:up` or `docker compose up`) brings up all persistent data stores and microservices with matching network topologies.

## Decision
We adopt Docker Compose as the local development orchestration standard:
- Persistent infrastructure services (MongoDB, Redis, Qdrant) run as containerized daemons with named volumes.
- Dev override configurations (`docker-compose.override.yml`) support hot-reloading for code without rebuild overhead.
- Container healthchecks prevent race conditions during service startup.

## Consequences
### Positive
- Zero "works on my machine" discrepancies between environments.
- High parity between local development and CI containerized build stages.
- Isolated port routing matching production reverse proxy paths.

### Negative
- Requires Docker Desktop or Docker Engine installed on developer machines.
