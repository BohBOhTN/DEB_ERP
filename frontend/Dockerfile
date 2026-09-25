# syntax=docker/dockerfile:1.7
# Build from the repository root: `docker build -f frontend/Dockerfile .`
# No API URL is baked in: the client calls `/api/v1` on its own origin and
# nginx forwards it to the backend container.

FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace frontend
COPY frontend/ frontend/
RUN npm run build --workspace frontend

FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:80/ || exit 1
EXPOSE 80
