FROM rust:1.99.0-slim-trixie AS routing-builder
RUN rustup target add wasm32-unknown-unknown && cargo install wasm-pack --locked
WORKDIR /routing
COPY wasm/fast_paths_wasm ./
RUN wasm-pack build --target web --out-dir /routing-output --out-name fast_paths_wasm

FROM oven/bun:1.4.2-alpine AS builder
WORKDIR /app
# Copy the manifest and lockfile first so dependency installation is cached and
# reproducible: `bun install --frozen-lockfile` fails the build if they drift.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
COPY --from=routing-builder /routing-output /app/public/wasm
RUN bun run build

FROM caddy:2.11.6-alpine
COPY --from=builder /app/dist /usr/share/caddy
