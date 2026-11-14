# The container supervisor. The only thing in this deployment that holds the Docker socket.
#
# A small image with a two-package dependency tree, because this process is the one
# whose compromise costs the host. Everything it needs is an HTTP server and a Docker client.
# The SPIRE CLI, taken from the official image at a pinned version rather than downloaded at build
# time. It is how entries are registered; without it identity is simply unavailable, which the
# supervisor reports and carries on from.
FROM ghcr.io/spiffe/spire-server:1.15.1 AS spire

FROM oven/bun:1.3.14-alpine

WORKDIR /app
# The lockfile as well as the manifest: `--frozen-lockfile` with no lockfile present resolves afresh
# and exits 0. This is the process whose compromise costs the host, so what it runs is the tree that
# was reviewed, not whatever the registry had this morning.
COPY supervisor/package.json supervisor/bun.lock ./
RUN bun install --frozen-lockfile

COPY --from=spire /opt/spire/bin/spire-server /usr/local/bin/spire-server

COPY supervisor/src ./src

# NOT ROOT, although this is the process holding the Docker socket. Nothing here needs privileges:
# it asks the socket over dockerode, whose mount in every deployment is read-only, and the one
# binary it shells out to (spire-server, for entry registration) talks to a Unix socket the same
# way. Root would buy nothing and mean a bug in one of four request handlers owned the host.
#
# THE GROUP IS THE WHOLE TRICK. The engine socket on the host is owned `root:docker`, and its GID
# is a fact about the HOST, not about this image: Debian and Ubuntu install it at 999, other
# engines differ. The build-time `docker` group here is intentionally arbitrary - base images
# already carry groups at common numbers (999 included), so forcing a GID at build time collides.
# What maps the socket's real GID is deploy/compose/docker-compose.yml adding `group_add:
# ${DOCKER_GID}` at RUNTIME, which is what covers pulled images too, whose build host's GID says
# nothing about the machine now running them.
#
# UID 1000 ON PURPOSE. The SPIRE containers run as uid 1000 - spire-init in the compose file
# chowns their volumes to it - and src/identity.ts connects this process to the spire-server
# socket inside one of those volumes. Matching the number means the socket's owner and this
# process's are the same, so the connection does not depend on the socket's other bits. The
# stock `bun` user already owns uid 1000, so it goes first.
RUN deluser bun \
  && addgroup docker \
  && adduser -D -u 1000 -G docker orbo
USER orbo:docker

EXPOSE 4300
CMD ["bun", "src/index.ts"]
