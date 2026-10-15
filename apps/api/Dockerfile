FROM node:20-alpine AS base
WORKDIR /app

RUN apk add --no-cache libc6-compat

# Copy workspace package manifests
COPY package.json package-lock.json* ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/api/package.json ./apps/api/

RUN npm install

# Copy source code
COPY packages/contracts ./packages/contracts
COPY apps/api ./apps/api

# Build contracts and api
RUN npm run build --workspace=@lumen/contracts
RUN npm run build --workspace=@lumen/api

EXPOSE 3000

CMD ["node", "apps/api/dist/server.js"]
