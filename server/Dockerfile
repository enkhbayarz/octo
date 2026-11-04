# syntax=docker/dockerfile:1

# ---- deps: install with bun from the lockfile ----
FROM oven/bun:1.3 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ---- build: TypeScript -> dist/ ----
FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN bun run build

# ---- prod-deps: runtime dependencies only ----
FROM oven/bun:1.3 AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ---- runtime: plain Node, no build tools, non-root ----
FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
COPY package.json ./
USER node
EXPOSE 3000
# Tracing loads first so it can patch http, pg and ioredis; it is a no-op without an OTLP endpoint.
CMD ["node", "--import", "./dist/instrumentation.js", "dist/index.js"]
