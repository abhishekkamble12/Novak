# 1. Base / Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/api/package.json ./apps/api/
RUN npm ci

# 2. Development Stage (targeted by dev override)
FROM deps AS dev
WORKDIR /app
COPY packages/contracts ./packages/contracts
COPY apps/api ./apps/api
EXPOSE 3000
CMD ["npm", "run", "dev", "--workspace=@novak/api"]

# 3. Production Build Stage
FROM deps AS build
WORKDIR /app
COPY packages/contracts ./packages/contracts
COPY apps/api ./apps/api
RUN npm run build --workspace=@novak/contracts
RUN npm run build --workspace=@novak/api

# 4. Production Runner Stage
FROM node:20-alpine AS prod
WORKDIR /app
RUN apk add --no-cache curl
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/api/package.json ./apps/api/
RUN npm ci --omit=dev

COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /app/apps/api/dist ./apps/api/dist

USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "apps/api/dist/server.js"]
