# The Tracely API server's container, built by Railway (server/DEPLOY.md,
# "Railway"). Built with the REPO ROOT as its context (the service variable
# RAILWAY_DOCKERFILE_PATH=server/Dockerfile), because the server also serves
# the extension's engine at /ext-content.js (STATIC_FILES in server.js), and
# that file lives outside server/. The root .dockerignore sends only the two.
#
# Node 24 is what CI tests on (.github/workflows/check.yml); node:sqlite needs
# 22.5 or later. The server has zero npm dependencies, so there is no install.
FROM node:24-slim

WORKDIR /app
COPY server/ ./
# STATIC_FILES serves "/ext-content.js" from extension/content.js relative to
# the server's own folder, which the Linode runbook copies in by hand.
COPY extension/content.js ./extension/content.js

# What is deployed, for /api/status `release` (lib/release.js). Railway hands
# its own variables to a Dockerfile only when they are declared as ARG. With
# no SHA nothing is written, and TRACELY_HOSTED below still marks the server
# as deployed.
ARG RAILWAY_GIT_COMMIT_SHA
RUN if [ -n "$RAILWAY_GIT_COMMIT_SHA" ]; then \
      printf '{"commit":"%s","deployedAt":"%s"}\n' "$RAILWAY_GIT_COMMIT_SHA" "$(date -u +%FT%TZ)" > release.json; \
    fi

# An image is only ever a deployed server: it refuses to run unmetered
# (refuseUnmetered in server.js), keeps its database on the volume mounted at
# /data, and listens beyond loopback so the platform's proxy can reach it.
ENV TRACELY_HOSTED=1 \
    TRACELY_DATA_DIR=/data \
    TRACELY_BIND=0.0.0.0

CMD ["sh", "scripts/container-start.sh"]
