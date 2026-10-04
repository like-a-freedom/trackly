FROM oven/bun:1.4.2-alpine AS builder
WORKDIR /app
# Copy the manifest and lockfile first so dependency installation is cached and
# reproducible: `bun install --frozen-lockfile` fails the build if they drift.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM caddy:2.11.6-alpine
COPY --from=builder /app/dist /usr/share/caddy