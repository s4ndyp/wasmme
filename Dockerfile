FROM node:20-alpine AS deps
WORKDIR /app
COPY admin/package.json admin/package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/data

RUN apk add --no-cache su-exec

COPY --from=deps /app/node_modules ./node_modules
COPY admin/package.json ./
COPY admin/server.js ./
COPY admin/public ./public
COPY admin/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
