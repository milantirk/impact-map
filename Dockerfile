# syntax=docker/dockerfile:1

# Impact Map: one image with the API (self-contained bundle) and the SPA files.
#
# Base images are pinned by tag. To pin a digest as well (reproducible builds),
# look it up and append it, for example:
#   docker buildx imagetools inspect node:24-alpine --format '{{json .Manifest.Digest}}'
#   FROM node:24-alpine@sha256:<digest>
# Dependabot (docker ecosystem) then keeps the digest up to date.

# ---- build ------------------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /src

# No browsers for the e2e workspace, no prompts.
ENV CI=true \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    npm_config_update_notifier=false

# Manifests first: the dependency layer is cached until a manifest changes.
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/
# Behind a TLS-inspecting proxy (e.g. Zscaler), pass its root CA as a build secret:
#   docker build --secret id=ca,src=/path/to/root-ca.pem -t impact-map:local .
# The secret is used only for npm and never stored in a layer.
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=secret,id=ca,required=false \
    if [ -s /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---- runtime ----------------------------------------------------------------
FROM node:24-alpine AS runtime

# The bundle needs only the node binary: remove the package managers to keep
# the image small and free of their (often vulnerable) dependencies.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg

ENV NODE_ENV=production \
    PORT=8080 \
    STATIC_DIR=/app/public

WORKDIR /app
# Files stay owned by root: the app user can read them but not change them.
COPY --from=build /src/apps/api/dist ./dist
COPY --from=build /src/apps/web/dist ./public

# Build metadata (declared late so that new values do not invalidate the layers above).
ARG VERSION=dev
ARG REVISION=unknown
ARG CREATED=unknown
ARG SOURCE=""

LABEL org.opencontainers.image.title="Impact Map" \
      org.opencontainers.image.description="See how one decision spreads to every area of life." \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.created="${CREATED}" \
      org.opencontainers.image.source="${SOURCE}" \
      org.opencontainers.image.base.name="docker.io/library/node:24-alpine"

# The deploy workflow reads /version.json to confirm that the new build is live.
RUN printf '{"version":"%s","revision":"%s","created":"%s"}\n' \
      "${VERSION}" "${REVISION}" "${CREATED}" > /app/public/version.json

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1

CMD ["node", "dist/server.js"]
