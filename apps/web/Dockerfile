FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/web/package.json ./apps/web/

RUN npm install

COPY packages/contracts ./packages/contracts
COPY apps/web ./apps/web

RUN npm run build --workspace=@lumen/contracts
RUN npm run build --workspace=@lumen/web

FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
