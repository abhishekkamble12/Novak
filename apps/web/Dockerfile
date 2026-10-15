# 1. Dependencies Stage
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/web/package.json ./apps/web/
RUN npm ci

# 2. Development Stage (target for docker-compose.override.yml)
FROM deps AS dev
WORKDIR /app
COPY packages/contracts ./packages/contracts
COPY apps/web ./apps/web
EXPOSE 5173
CMD ["npm", "run", "dev", "--workspace=@novak/web", "--", "--host", "0.0.0.0"]

# 3. Production Build Stage
FROM deps AS build
WORKDIR /app
COPY packages/contracts ./packages/contracts
COPY apps/web ./apps/web
RUN npm run build --workspace=@novak/contracts
RUN npm run build --workspace=@novak/web

# 4. Production Runner Stage (Nginx serving SPA)
FROM nginx:1.27-alpine AS prod
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=20s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
