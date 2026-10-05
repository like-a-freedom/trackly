FROM rust:1.99.0-slim-trixie AS routing-builder
RUN rustup target add wasm32-unknown-unknown && cargo install wasm-pack --locked
WORKDIR /routing
COPY wasm/fast_paths_wasm ./
RUN wasm-pack build --target web --out-dir /routing-output --out-name fast_paths_wasm

FROM routing-builder AS graph-builder
RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /frontend/wasm/fast_paths_wasm
COPY wasm/fast_paths_wasm ./
COPY scripts/prepare-routing.py /frontend/scripts/prepare-routing.py
RUN python3 /frontend/scripts/prepare-routing.py

FROM oven/bun:1.4.2-alpine AS builder
WORKDIR /app
# Copy the manifest and lockfile first so dependency installation is cached and
# reproducible: `bun install --frozen-lockfile` fails the build if they drift.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
COPY --from=routing-builder /routing-output /app/public/wasm
COPY --from=graph-builder /frontend/public/graphs /app/public/graphs
RUN bun run build

FROM caddy:2.11.6-alpine
COPY --from=builder /app/dist /usr/share/caddy
