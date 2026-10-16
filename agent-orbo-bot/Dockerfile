# The built-in Bot only speaks AG-UI and a model provider; the browser runs in a separate computer
# container so either side can be replaced independently.
FROM oven/bun:1.3-alpine

WORKDIR /app
RUN chown bun:bun /app
USER bun
# The lockfile as well as the manifest: `--frozen-lockfile` with no lockfile present resolves afresh
# and exits 0, so the file has to be here for the flag to mean anything.
COPY --chown=bun:bun agent-orbo-bot/package.json agent-orbo-bot/bun.lock ./agent-orbo-bot/
RUN cd agent-orbo-bot && bun install --frozen-lockfile

# Preserve the repo layout so `../../shared/bot-prompt` resolves the same in the image and locally.
COPY --chown=bun:bun shared ./shared
COPY --chown=bun:bun agent-orbo-bot/src ./agent-orbo-bot/src

ENV PORT=4200
EXPOSE 4200
CMD ["bun", "agent-orbo-bot/src/index.ts"]
