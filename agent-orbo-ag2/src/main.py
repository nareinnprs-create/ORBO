"""AG2 as a Bot. AG-UI is an extra in AG2's own package, so `ag2[ag-ui]` is the dependency."""

import hmac
import os
import sys
from pathlib import Path

# The spec file every language in the box reads: one level above this Bot in the repository, and
# one level above /app/src in the image the Dockerfile builds.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "shared"))
from model_providers import bot_settings

from ag2 import Agent
from ag2.ag_ui import AGUIStream
from ag2.config import AnthropicConfig, OpenAIConfig
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

TOKEN_HEADER = "x-orbo-agent-token"


def _require_server_token() -> None:
    """Refuse to boot without ORBO's token, rather than boot "healthy" and 401 every run.

    The middleware below keeps checking per request — belt and braces for a container that
    started before the token existed — but a harness that starts and then 401s every run reports
    healthy to Compose forever, and the shell restarts a dead process, never a useless one. Boot
    is the moment a deployment can still act, the same posture as `agent-orbo-bot/src/index.ts`.
    `/health` stays exempt because Compose polls it before any token exists.
    """
    if not (os.environ.get("ORBO_MANAGED_AGENT_TOKEN") or "").strip():
        raise SystemExit(
            "ORBO_MANAGED_AGENT_TOKEN is not set. This process holds a model credential and will "
            "not start without a token for ORBO's server."
        )


_require_server_token()


def _config() -> AnthropicConfig | OpenAIConfig:
    """The provider the model screen chose, which AG2 reaches through a config of its own.

    `BOT_PROVIDER` is `anthropic` for an Anthropic key and `openai` otherwise, an OpenAI-compatible
    endpoint included. Each SDK reads its own key from the environment.
    """
    settings = bot_settings("agent-ag2")
    provider = settings.provider
    model = settings.model
    if provider == "anthropic":
        # Compose exports missing overrides as ""; the SDK only defaults an absent URL.
        base_url = (os.environ.get("ANTHROPIC_BASE_URL") or "").strip() or "https://api.anthropic.com"
        return AnthropicConfig(model=model, base_url=base_url)
    # The same "" for OPENAI_BASE_URL, which Compose writes whenever the model screen chose a plain
    # OpenAI key. The SDK only defaults an absent URL; given "", every request fails to connect.
    base_url = (os.environ.get("OPENAI_BASE_URL") or "").strip() or "https://api.openai.com/v1"
    return OpenAIConfig(model=model, base_url=base_url)


agent = Agent(
    name="orbo",
    prompt="Answer the question you are asked, briefly and correctly.",
    config=_config(),
)
stream = AGUIStream(agent)

app = FastAPI()


@app.middleware("http")
async def refuse_without_the_server_token(request: Request, call_next):
    if request.url.path != "/health":
        expected = (os.environ.get("ORBO_MANAGED_AGENT_TOKEN") or "").strip()
        offered = (request.headers.get(TOKEN_HEADER) or "").strip()
        if not expected or not hmac.compare_digest(offered.encode("utf-8"), expected.encode("utf-8")):
            return JSONResponse({"error": "unauthorised"}, status_code=401)
    return await call_next(request)


@app.get("/health")
async def health():
    return {"ok": True, "harness": "ag2"}


# `build_asgi` rather than a helper: AG2 hands back a plain ASGI app to mount.
app.mount("/", stream.build_asgi())
