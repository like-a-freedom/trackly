FROM node:24-alpine AS builder
WORKDIR /app
COPY . .
RUN npm install && npm run build

FROM caddy:2-alpine
COPY --from=builder /app/dist /usr/share/caddy