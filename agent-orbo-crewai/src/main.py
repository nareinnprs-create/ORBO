"""CrewAI as a Bot.

The third harness in the box, and the first built the way every one after it will be: the AG-UI
integration that CrewAI's own ecosystem publishes, mounted on FastAPI, with nothing of the protocol
written here. `agent-bot` and `agent-langgraph` speak AG-UI by hand because they predate the rule
that we do not write adapters. This one imports `ag_ui_crewai` and stops.

The contract with the rest of ORBO is the same one the other Bots meet, and it is small:
serve AG-UI on a port, answer `/health`, and refuse anybody who does not carry the server's token.
"""

import hmac
import inspect
import os
import sys
from collections.abc import Mapping
from copy import deepcopy
from pathlib import Path
from typing import Any

# The spec file every language in the box reads: one level above this Bot in the repository, and
# one level above /app/src in the image the Dockerfile builds.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "shared"))
from model_providers import bot_settings

import ag_ui_crewai.endpoint as crewai_endpoint
from ag_ui.core import Message, Tool
from pydantic import BaseModel, ConfigDict
from ag_ui_crewai import add_crewai_flow_fastapi_endpoint
from ag_ui_crewai.sdk import copilotkit_stream
from crewai.flow.flow import Flow, listen, start
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from litellm import acompletion
from litellm.litellm_core_utils.streaming_handler import CustomStreamWrapper

# The one header ORBO's server sends when it calls a managed Bot. Same name the TypeScript Bots
# check, because a Bot is a Bot whatever it is written in.
TOKEN_HEADER = "x-orbo-agent-token"


def _expected_token() -> str:
    return (os.environ.get("ORBO_MANAGED_AGENT_TOKEN") or "").strip()


def _require_server_token() -> None:
    """Refuse to boot without ORBO's token, rather than boot "healthy" and 401 every run.

    The middleware below keeps checking per request — belt and braces for a container that
    started before the token existed — but a harness that starts and then 401s every run reports
    healthy to Compose forever, and the shell restarts a dead process, never a useless one. Boot
    is the moment a deployment can still act, the same posture as `agent-orbo-bot/src/index.ts`.
    `/health` stays exempt because Compose polls it before any token exists.
    """
    if not _expected_token():
        raise SystemExit(
            "ORBO_MANAGED_AGENT_TOKEN is not set. This process holds a model credential and will "
            "not start without a token for ORBO's server."
        )


_require_server_token()


def _model() -> str:
    """The provider and model ORBO chose, in the form litellm wants.

    `BOT_PROVIDER` and `BOT_MODEL` are set by the shell from the model screen. litellm addresses a
    model as `provider/model`, and it reads that provider's key from the environment itself, which
    is why nothing here touches a key.

    The model half is whatever the endpoint publishes, slashes included. litellm takes the first
    path component as the provider and sends the rest as the model name, so a name that already
    contains a slash still needs the chosen provider in front: `qwen/qwen3-8b` on an
    OpenAI-compatible endpoint is `openai/qwen/qwen3-8b`, and `openai/gpt-5.6-terra` is
    `openai/openai/gpt-5.6-terra`. Treating a slash as "already a provider" dropped the prefix,
    and litellm then either routed to a provider nobody configured (`LLM Provider NOT provided`)
    or sent only the second half to the endpoint.
    """
    settings = bot_settings("agent-crewai")
    provider = settings.provider
    model = settings.model
    return f"{provider}/{model}"


_PROVIDER_MESSAGE_FIELDS = {
    "developer": {"role", "content", "name"},
    "system": {"role", "content", "name"},
    "user": {"role", "content", "name"},
    "assistant": {
        "role",
        "audio",
        "content",
        "function_call",
        "name",
        "refusal",
        "tool_calls",
    },
    "tool": {"role", "content", "tool_call_id"},
}


def _message_dict(message: Any) -> dict[str, Any]:
    if isinstance(message, Mapping):
        return dict(message)
    return message.model_dump()


def _strip_none(message: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in message.items() if value is not None}


def _provider_tool_calls(tool_calls: Any) -> Any:
    if not isinstance(tool_calls, list):
        return deepcopy(tool_calls)
    projected = []
    for tool_call in tool_calls:
        if not isinstance(tool_call, Mapping):
            tool_call = tool_call.model_dump()
        projected.append(
            _strip_none(
                {
                    key: deepcopy(tool_call[key])
                    for key in ("id", "type", "function")
                    if key in tool_call
                }
            )
        )
    return projected


def _provider_messages(messages: list[Any]) -> list[dict[str, Any]]:
    """Project AG-UI state messages to provider chat fields without mutating state."""
    provider_messages = []
    for message in messages:
        message_dict = _message_dict(message)
        allowed_fields = _PROVIDER_MESSAGE_FIELDS.get(message_dict.get("role"))
        if allowed_fields is None:
            continue
        projected = {
            key: deepcopy(value)
            for key, value in message_dict.items()
            if key in allowed_fields
        }
        if "tool_calls" in projected:
            projected["tool_calls"] = _provider_tool_calls(projected["tool_calls"])
        provider_messages.append(_strip_none(projected))
    return provider_messages


_prepare_crewai_inputs = crewai_endpoint.crewai_prepare_inputs

# The wrapper below always receives `context` and `forwarded_props` (the AG-UI run input carries
# both), but the pinned ag-ui-crewai 0.1.2 only accepts state, messages and tools - the newer
# fields arrived after it. Forward only what the installed adapter accepts, so the pin can move
# without this seam breaking in either direction.
_PREPARE_INPUT_FIELDS = {
    name
    for name in ("state", "messages", "tools", "context", "forwarded_props")
    if name in inspect.signature(_prepare_crewai_inputs).parameters
}


def _orbo_prepare_crewai_inputs(
    *,
    state: dict,
    messages: list[Message],
    tools: list[Tool],
    context: list[Any] | None = None,
    forwarded_props: Any = None,
):
    offered = {
        "state": state,
        "messages": messages,
        "tools": tools,
        "context": context,
        "forwarded_props": forwarded_props,
    }
    inputs = _prepare_crewai_inputs(
        **{field: value for field, value in offered.items() if field in _PREPARE_INPUT_FIELDS}
    )
    # The pinned adapter's merge keeps only state and messages - the caller's tool schemas are
    # the model's to answer with, so carry them through here.
    inputs["tools"] = tools
    if messages and getattr(messages[0], "role", None) == "system":
        prepared_messages = inputs.get("messages")
        if isinstance(prepared_messages, list):
            leading_system = messages[0].model_dump()
            if prepared_messages[:1] != [leading_system]:
                inputs["messages"] = [leading_system, *prepared_messages]
    return inputs


crewai_endpoint.crewai_prepare_inputs = _orbo_prepare_crewai_inputs


def _provider_tools(tools: list[Any]) -> list[dict[str, Any]] | None:
    """AG-UI carries a tool as its bare schema; the provider wants OpenAI's function envelope."""
    if not tools:
        return None
    converted = []
    for tool in tools:
        if hasattr(tool, "model_dump"):
            tool = tool.model_dump()
        converted.append(
            tool if "function" in tool
            else {
                "type": "function",
                "function": {key: tool[key] for key in ("name", "description", "parameters") if key in tool},
            }
        )
    return converted or None


# The flow's state is a typed model, not a dict, because that is the state shape the pinned
# ag-ui-crewai 0.1.2 is written against: its snapshot handler reads `state.messages` as an
# attribute, and a dict state crashes that handler, which is how MESSAGES_SNAPSHOT (and with it
# the whole conversation record) disappears from the stream. `extra="allow"` carries the fields
# the AG-UI input adds (`copilotkit`) without the flow caring about them.
class ORBOState(BaseModel):
    model_config = ConfigDict(extra="allow")

    messages: list[Any] = []
    tools: list[Any] | None = None


class ORBOFlow(Flow[ORBOState]):
    """A crew of one, which is the right size for a Bot answering a person.

    CrewAI's own examples build multi-agent crews, and a person who wants that edits this. What
    ships has to answer the first question somebody asks it without a role, a goal and a backstory
    being invented on their behalf.
    """

    @start()
    async def answer(self):
        # Streamed completions go through copilotkit_stream: the pinned ag-ui-crewai only emits
        # TOOL_CALL_CHUNK / TEXT_MESSAGE_CHUNK from its streaming bridge, and without those events
        # a caller never sees the model's tool calls. The bridge hands back the assembled
        # completion; a completion that is already whole (the tests' fakes) needs no bridge.
        response = await acompletion(
            model=_model(),
            messages=_provider_messages(self.state.messages),
            tools=_provider_tools(self.state.tools),
            stream=True,
        )
        if isinstance(response, CustomStreamWrapper):
            response = await copilotkit_stream(response)
        self.state.messages.append(response.choices[0].message.model_dump())

app = FastAPI()


@app.middleware("http")
async def refuse_without_the_server_token(request: Request, call_next):
    """Everything but `/health` carries the server's token.

    `/health` is exempt because Compose polls it before anything has a token to send, and a
    healthcheck that authenticates is a container that never reports healthy.
    """
    if request.url.path != "/health":
        expected = _expected_token()
        offered = (request.headers.get(TOKEN_HEADER) or "").strip()
        # An unset token means unconfigured, not open. A Bot that answers anybody because nobody
        # set a secret is the failure this check exists for.
        if not expected or not hmac.compare_digest(offered.encode("utf-8"), expected.encode("utf-8")):
            return JSONResponse({"error": "unauthorised"}, status_code=401)
    return await call_next(request)


@app.get("/health")
async def health():
    return {"ok": True, "harness": "crewai"}


add_crewai_flow_fastapi_endpoint(app, ORBOFlow(), "/")
