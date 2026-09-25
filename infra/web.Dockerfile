# Web — bangun SPA Vue, sajikan lewat nginx non-root yang memproksi /api ke layanan api.
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY packages/domain/package.json packages/domain/
COPY packages/ui/package.json packages/ui/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY packages packages
COPY apps/web apps/web
RUN npm run build -w @erp/domain && npm run build -w @erp/web

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
