"""Claude Agent SDK as a Bot, through `ag-ui-claude-sdk`.

This is the row where a plan can stand in for a key. `claude setup-token` mints a
`CLAUDE_CODE_OAUTH_TOKEN` against a Pro or Max subscription and the SDK accepts it, which is why
this harness is the one the model screen offers a subscription on.

The precedence trap is the thing to get right: `ANTHROPIC_API_KEY` wins over the OAuth token, so a
deployment that sets both silently bills the key and the plan goes unused. ORBO sets one.
"""

import hmac
import os

from ag_ui_claude_sdk import add_claude_fastapi_endpoint
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .adapter import ORBOClaudeAgentAdapter

TOKEN_HEADER = "x-orbo-agent-token"


def _require_server_token() -> None:
    """Refuse to boot without ORBO's token, before even the credentials check below.

    The middleware further down keeps checking per request — belt and braces for a container that
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


def _refuse_both_credentials() -> None:
    """One credential or the other, never both.

    Anthropic resolves `ANTHROPIC_API_KEY` ahead of `CLAUDE_CODE_OAUTH_TOKEN`, so a container given
    both uses the key and quietly ignores the subscription somebody chose. Failing here is the only
    way that becomes visible: the alternative is a correct-looking Bot on the wrong credential.
    """
    key = (os.environ.get("ANTHROPIC_API_KEY") or "").strip()
    plan = (os.environ.get("CLAUDE_CODE_OAUTH_TOKEN") or "").strip()
    if key and plan:
        raise SystemExit(
            "Both ANTHROPIC_API_KEY and CLAUDE_CODE_OAUTH_TOKEN are set. Anthropic prefers the key, "
            "so the subscription would be ignored. Set one."
        )
    if not key and not plan:
        raise SystemExit(
            "Set ANTHROPIC_API_KEY, or CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`."
        )


_refuse_both_credentials()

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
    return {"ok": True, "harness": "claude-agent-sdk"}


add_claude_fastapi_endpoint(
    app=app,
    adapter=ORBOClaudeAgentAdapter(name="orbo"),
    path="/",
)

model_adapter = ORBOClaudeAgentAdapter(name="orbo-model", model_only=True)
add_claude_fastapi_endpoint(
    app=app,
    adapter=model_adapter,
    path="/model",
)


class CancelModelRun(BaseModel):
    threadId: str = Field(min_length=1, max_length=128)


@app.post("/model/cancel")
async def cancel_model_run(request: CancelModelRun):
    await model_adapter.interrupt(request.threadId)
    return {"ok": True}
