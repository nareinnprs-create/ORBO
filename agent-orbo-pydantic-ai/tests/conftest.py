"""Give every harness import the server token before pytest touches the harness module.

`src/main.py` refuses to boot without ORBO_MANAGED_AGENT_TOKEN (the same posture as
`agent-orbo-bot/src/index.ts`), and pytest imports test modules before any test fixture can set
the variable - some suites even import `src.main` at module level, at collection. Conftest runs
first, so this is where a stand-in token is set: only when the environment carries none, so a
real deployment value still wins and the boot-refusal test strips it before spawning the child.
"""

import os

os.environ.setdefault("ORBO_MANAGED_AGENT_TOKEN", "test-token")