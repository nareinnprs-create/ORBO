"""Give every harness import the server token before pytest touches the harness module.

`src/main.py` refuses to boot without ORBO_MANAGED_AGENT_TOKEN (the same posture as
`agent-orbo-bot/src/index.ts`), and pytest imports test modules before any test fixture can set
the variable - some suites even import `src.main` at module level, at collection. Conftest runs
first, so this is where a stand-in token is set: only when the environment carries none, so a
real deployment value still wins and the boot-refusal test strips it before spawning the child.

The stand-in is also removed again at unconfigure when it was ours: the token-restoration probe
asserts the environment reads exactly as it did before the session ran, and a stand-in that
outlives pytest would read as a leaked credential there.
"""

import os

_STAND_IN_TOKEN = "test-token"

if not os.environ.get("ORBO_MANAGED_AGENT_TOKEN"):
    os.environ["ORBO_MANAGED_AGENT_TOKEN"] = _STAND_IN_TOKEN
    _STAND_IN_SET = True
else:
    _STAND_IN_SET = False


def pytest_unconfigure(config):
    if _STAND_IN_SET and os.environ.get("ORBO_MANAGED_AGENT_TOKEN") == _STAND_IN_TOKEN:
        del os.environ["ORBO_MANAGED_AGENT_TOKEN"]
