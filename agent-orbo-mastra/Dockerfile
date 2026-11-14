# Mastra, as a Bot. Bun and Mastra's own server, because Mastra serves its AG-UI route itself
# rather than handing back a handler to mount.
FROM oven/bun:1.3-alpine

WORKDIR /app
# The lockfile as well as the manifest: `--frozen-lockfile` with no lockfile present resolves afresh
# and exits 0, so the file has to be here for the flag to mean anything.
COPY agent-orbo-mastra/package.json agent-orbo-mastra/bun.lock ./
RUN bun install --frozen-lockfile

COPY shared/listen-port.ts /shared/listen-port.ts
COPY shared/model-providers.ts /shared/model-providers.ts
COPY shared/model-providers.json /shared/model-providers.json
COPY agent-orbo-mastra/src ./src

# Built at image time, not at start: `mastra start` runs a bundle, and building on every container
# start would put a build step in front of a person waiting for a Bot.
RUN bunx mastra build --dir src/mastra

ENV PORT=4213
EXPOSE 4213
CMD ["bunx", "mastra", "start"]
