# Dependencies are installed in their own stage. The compilers are only needed
# if a prebuilt better-sqlite3 binary is not published for the platform.
FROM node:22-bookworm-slim AS deps

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim

# gosu drops root cleanly once the mounted disk has been made writable.
RUN apt-get update \
 && apt-get install -y --no-install-recommends gosu \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATA_DIR=/data

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server.js ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# The database lives here. Mount a persistent disk at /data - on Railway, a
# Volume attached to the service - otherwise every deploy starts with an empty
# register. No VOLUME instruction: hosting platforms manage that themselves.
RUN mkdir -p /data \
 && chown -R node:node /data /app \
 && chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

# Starts as root only long enough to make the mounted disk writable, then runs
# the register as the unprivileged node user.
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
