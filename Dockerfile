# Build stage: compiler tools are only needed if a prebuilt better-sqlite3
# binary is not published for this platform (e.g. arm64 servers).
FROM node:22-bookworm-slim AS deps

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Runtime stage
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/data

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server.js ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts

# The database lives on a volume so it survives image rebuilds.
# Attach a Railway Volume mounted at /data in the service settings to persist this directory.
RUN mkdir -p /data && chown -R node:node /data /app

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
