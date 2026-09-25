# API — build multi-tahap, kontainer non-root, sistem berkas baca-saja (K-60).
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY packages/domain/package.json packages/domain/
COPY packages/ui/package.json packages/ui/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY packages/domain packages/domain
COPY apps/api apps/api
COPY prototype/assets prototype/assets
RUN npm run build -w @erp/domain && npm run build -w @erp/api \
 && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /src/node_modules node_modules
COPY --from=build /src/packages/domain packages/domain
COPY --from=build /src/apps/api/dist apps/api/dist
COPY --from=build /src/apps/api/package.json apps/api/package.json
COPY --from=build /src/prototype/assets prototype/assets
USER node
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
