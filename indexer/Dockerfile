FROM node:20-alpine

# Build metadata (issue #1047). The publishing workflow passes these at
# `docker build` time; a local build falls back to the "unknown" placeholders
# that `GET /version` reports.
ARG BUILD_VERSION=unknown
ARG BUILD_REVISION=unknown
ARG BUILD_SOURCE=https://github.com/BCPathway/bc-forge
ARG BUILD_DATE=unknown
ARG BUILD_NAME=bc-forge-indexer

# OCI image annotations. Declared before the dependency layers so changing
# build metadata does not invalidate the cached npm/prisma layers.
LABEL org.opencontainers.image.title="bc-forge-indexer" \
      org.opencontainers.image.description="Server indexer microservice for bc-forge" \
      org.opencontainers.image.source="${BUILD_SOURCE}" \
      org.opencontainers.image.revision="${BUILD_REVISION}" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="BCPathway" \
      org.opencontainers.image.source-name="${BUILD_SOURCE}"

# Install openssl for Prisma engine support on Alpine
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package manifests. The lockfile glob keeps the build working while the
# indexer has no lockfile of its own; drop the `*` once one is committed.
COPY package.json package-lock.json* ./

# Install production and build dependencies
RUN if [ -f package-lock.json ]; then npm ci; else npm install --no-audit --no-fund; fi

# Copy Prisma schema and source code required for generation and build
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript source
RUN npm run build

# Expose default HTTP port
EXPOSE 3000

# Default port environment variable
ENV PORT=3000

# Build metadata surfaced at runtime by the unauthenticated GET /version
# endpoint, so an operator can identify the commit a container is running.
ENV BUILD_NAME=${BUILD_NAME} \
    BUILD_VERSION=${BUILD_VERSION} \
    BUILD_REVISION=${BUILD_REVISION} \
    BUILD_SOURCE=${BUILD_SOURCE} \
    BUILD_DATE=${BUILD_DATE}

# Start compiled server
CMD ["npm", "start"]
