FROM node:25-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

FROM caddy:2.10-alpine
COPY --from=builder /app/dist /usr/share/caddy