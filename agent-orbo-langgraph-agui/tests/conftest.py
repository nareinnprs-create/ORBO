"""Make harness imports independent of pytest's working directory and test order."""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# `src/main.py` refuses to boot without ORBO_MANAGED_AGENT_TOKEN (the same posture as
# `agent-orbo-bot/src/index.ts`), and these suites import it at module level, at collection -
# before any fixture could set the variable. Only fill an absent value: a real deployment token
# wins, and the boot-refusal test strips it from the child environment it builds itself.
os.environ.setdefault("ORBO_MANAGED_AGENT_TOKEN", "test-token")
