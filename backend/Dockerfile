FROM --platform=${BUILDPLATFORM:-linux/amd64} rust:slim AS builder
RUN apt update && apt install -y --no-install-recommends \
    musl-tools musl-dev clang llvm perl cmake libc6-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install -y gcc-i686-linux-gnu gcc-x86-64-linux-gnu \
    gcc-aarch64-linux-gnu g++-aarch64-linux-gnu libc++-dev
RUN update-ca-certificates
WORKDIR /app
COPY . .
ARG TARGETARCH TARGETPLATFORM
RUN echo "Building for ${TARGETARCH} on ${TARGETPLATFORM}"

RUN if [ "${TARGETARCH}" = "arm64" ]; then \
    export CC_aarch64_unknown_linux_musl="clang" \
    && export AR_aarch64_unknown_linux_musl="llvm-ar" \
    && export CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_RUSTFLAGS="-Clink-self-contained=yes -Clinker=rust-lld" \
    && export CXXFLAGS=-stdlib=libc++ CXX=clang++ \
    && rustup target add aarch64-unknown-linux-musl \
    && cargo build --release --target aarch64-unknown-linux-musl \
    && mv ./target/aarch64-unknown-linux-musl/release/backend /app/backend ;\
    fi

RUN if [ "${TARGETARCH}" = "amd64" ]; then \
    export CC_x86_64_unknown_linux_musl=clang \
    && export CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_RUSTFLAGS="-Clink-self-contained=yes -Clinker=rust-lld" \
    && rustup target add x86_64-unknown-linux-musl \
    && cargo build --release --target x86_64-unknown-linux-musl \
    && mv ./target/x86_64-unknown-linux-musl/release/backend /app/backend ;\
    fi

FROM gcr.io/distroless/cc-debian12
COPY --from=builder /app/backend /app/backend
COPY migrations /app/migrations
EXPOSE 8080
USER 1000:1000
ENTRYPOINT ["/app/backend"]