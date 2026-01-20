FROM oven/bun:alpine AS builder
WORKDIR /app
COPY package.json ./
RUN bun install
COPY . .
RUN bun run build

FROM caddy:2.10-alpine
COPY --from=builder /app/dist /usr/share/caddy