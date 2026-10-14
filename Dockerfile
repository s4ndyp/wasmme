FROM node:20-alpine AS deps
WORKDIR /app
COPY admin/package.json admin/package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/data

COPY --from=deps /app/node_modules ./node_modules
COPY admin/package.json ./
COPY admin/server.js ./
COPY admin/public ./public

RUN mkdir -p /data/staging /data/published

EXPOSE 8080
USER node
CMD ["node", "server.js"]
