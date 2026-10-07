# Citra produksi minimal — tanpa dependensi runtime pihak ketiga.
FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DB_FILE=/data/erp.sqlite BACKUP_DIR=/data/backups
WORKDIR /app
COPY server ./server
COPY web ./web
COPY prototype/assets/tokens.css prototype/assets/app.css prototype/assets/charts.js ./prototype/assets/
COPY tools/backup.mjs tools/restore.mjs ./tools/
COPY package.json ./
RUN addgroup -S erp && adduser -S -G erp -H erp && mkdir -p /data && chown erp:erp /data
USER erp
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "--no-warnings", "server/index.js"]
