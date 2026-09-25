# syntax=docker/dockerfile:1.7
# Build from the repository root: `docker build -f backend/Dockerfile .`
# The workspace lockfile at the root is the single source of dependencies.

FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace backend
COPY backend/ backend/
RUN npm run prisma:generate --workspace backend \
  && npm run build --workspace backend

FROM node:24-alpine AS runner
# dumb-init forwards signals for a clean shutdown, wget serves the health
# check, openssl is what the Prisma engine links against on Alpine.
RUN apk add --no-cache dumb-init wget openssl
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
# Production dependencies only; `prisma` stays because the migration
# container of the deploy runs `prisma migrate deploy` from this image.
RUN npm ci --workspace backend --omit=dev && npm cache clean --force
COPY backend/prisma backend/prisma
RUN npm run prisma:generate --workspace backend
COPY --from=builder /app/backend/dist backend/dist
USER node
WORKDIR /app/backend
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4000/api/health/ready || exit 1
CMD ["dumb-init", "node", "dist/server.js"]
