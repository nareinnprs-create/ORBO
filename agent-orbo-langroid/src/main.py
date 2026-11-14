"""Langroid as a Bot, through `ag-ui-langroid`, which AG-UI maintains."""

import hmac
import os
import sys
from pathlib import Path

# The spec file every language in the box reads: one level above this Bot in the repository, and
# one level above /app/src in the image the Dockerfile builds.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "shared"))
from model_providers import bot_settings

from ag_ui_langroid import create_langroid_app
from fastapi import Request
from fastapi.responses import JSONResponse
from langroid import ChatAgent, ChatAgentConfig
from langroid.language_models import OpenAIGPTConfig

from .frontend_tools import FrontendToolsAgent

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


def _model_id() -> str:
    """Langroid names an OpenAI model bare and everything else through litellm.

    `openai/gpt-4o-mini` is rejected by its OpenAI client as an invalid model id, so the prefix goes
    on only when the provider is somebody else.
    """
    settings = bot_settings("agent-langroid")
    provider = settings.provider
    model = settings.model
    if "/" in model or provider == "openai":
        return model
    return f"litellm/{provider}/{model}"


# An empty `OPENAI_API_KEY` is no key. Compose writes the keys a model choice does not use as empty
# rather than leaving them out, and Langroid reads `OPENAI_API_KEY` as its own setting: given an empty
# one it builds an OpenAI client with it, even for a model it hands to litellm, and the client refuses
# to be built. Unset, Langroid uses its placeholder and litellm reads the chosen provider's own key.
if not os.environ.get("OPENAI_API_KEY"):
    os.environ.pop("OPENAI_API_KEY", None)

# And an empty `OPENAI_BASE_URL` is no address. Compose writes it empty when the model screen chose a
# plain OpenAI key. Langroid builds its OpenAI client with no `base_url`, so the SDK reads this
# variable itself, and it falls back to `https://api.openai.com/v1` only when the variable is absent:
# given "", every request was built with no host and failed to connect. A real endpoint is left alone.
if not os.environ.get("OPENAI_BASE_URL", "").strip():
    os.environ.pop("OPENAI_BASE_URL", None)

agent = ChatAgent(
    ChatAgentConfig(
        llm=OpenAIGPTConfig(chat_model=_model_id(), parallel_tool_calls=False),
        add_to_registry=False,
        use_functions_api=True,
        use_tools=False,
        system_message="Answer the question you are asked, briefly and correctly.",
    )
)

app = create_langroid_app(FrontendToolsAgent(name="orbo", agent=agent))


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
    return {"ok": True, "harness": "langroid"}
