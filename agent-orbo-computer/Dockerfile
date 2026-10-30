# The Bot's computer installs only the Playwright browser it launches.
#
# The image tag and Playwright dependency must be pinned to the same exact version. Bump both or
# neither.
FROM node:24.18.1-bookworm-slim AS node-toolchain
FROM oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4 AS bun-toolchain

FROM ubuntu:24.04

# The Bun image digest pins the amd64/arm64 release bytes, including if its tag changes.
ARG PLAYWRIGHT_VERSION=1.62.1
ENV BUN_INSTALL=/usr/local
ENV PATH="/usr/local/bin:${PATH}"
ENV DEBIAN_FRONTEND=noninteractive
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=node-toolchain /usr/local /usr/local
COPY --from=bun-toolchain /usr/local/bin/bun /usr/local/bin/bun
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl unzip xz-utils \
  && ln -s bun /usr/local/bin/bunx \
  && bunx --bun "playwright@${PLAYWRIGHT_VERSION}" install --with-deps chromium \
  && rm -rf /root/.cache /tmp/* /var/lib/apt/lists/*

WORKDIR /app
# The lockfile as well as the manifest: `--frozen-lockfile` with no lockfile present resolves afresh
# and exits 0, so the file has to be here for the flag to mean anything.
COPY agent-orbo-computer/package.json agent-orbo-computer/bun.lock ./
RUN bun install --frozen-lockfile

COPY agent-orbo-computer/src ./src
# index.ts imports ../../shared/file-download at runtime (the other shared imports are type-only and
# erased), so the one file it needs goes where that path resolves from /app/src.
COPY shared/file-download.ts /shared/file-download.ts

# Durable working directory. Bot-produced files that must survive replacement live here.
#
# THE BROWSER'S USER IS A CONTRACT, AND THE NUMBER IS PINNED FOR THE SAME REASON THE ROOT IMAGE
# PINS ITS OWN. The root image (this repository's main Dockerfile) creates `pwuser` at uid 1001 and
# runs the browser and the shell as it — `--no-sandbox` Chromium makes the process user the
# boundary, and root would mean a page exploit lands as root — and the supervisor starts every
# per-Bot container with `user: 1001:1001` on the strength of that. This image carries the same
# user at the same number, so the standalone shared computer and every per-Bot one agree on who
# the browser is.
#
# `ubuntu:24.04` ships `ubuntu` at 1000, so an unpinned `useradd` would land wherever the base had
# already counted to. `--uid 1001` is what makes the number in the supervisor and in the compose
# file mean this user on every build.
#
# The directories a non-root process writes are owned here, because it cannot create them at the
# root of the filesystem and the failure would surface as EACCES on the first navigation: the
# workspace, the browser profiles, and the home the shell and Chromium expect.
RUN useradd --uid 1001 --create-home --shell /bin/bash pwuser \
  && mkdir -p /workspace /profiles \
  && chown -R pwuser:pwuser /workspace /profiles /app /home/pwuser

ENV WORKSPACE_DIR=/workspace

ENV PORT=4100
EXPOSE 4100
# Readiness is exposed through Docker health so the supervisor need not know the network route.
HEALTHCHECK --interval=2s --timeout=3s --start-period=2s --retries=30 \
  CMD bun -e "const r = await fetch('http://localhost:4100/health'); process.exit(r.ok ? 0 : 1)"

# The browser, the shell and the server run as the user who owns their own files, for the reason
# the useradd above gives.
USER pwuser

CMD ["bun", "src/index.ts"]
