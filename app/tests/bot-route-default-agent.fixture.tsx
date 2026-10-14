import { afterAll, beforeAll, spyOn } from "bun:test";
import { useState } from "react";
import * as ActiveBot from "@/lib/copilot/active-bot";
import * as BotThread from "@/lib/copilot/bot-thread";
import * as StoppedTurn from "@/lib/copilot/stopped-turn";
import * as ReactCoreV2 from "@copilotkit/react-core/v2";

/**
 * Restorable namespace spies rather than `mock.module`, which bun cannot unregister. `mock.module`
 * is process-global and outlives this file, so every test file walked into the same process
 * afterwards would import the stub instead of the real module. A namespace spy is put back by
 * `mockRestore`, so the real modules survive for every other file.
 */
const copilotChatSpy = spyOn(ReactCoreV2, "CopilotChat");
const useActiveBotSpy = spyOn(ActiveBot, "useActiveBot");
const useBotThreadSpy = spyOn(BotThread, "useBotThread");
const useStoppedTurnSpy = spyOn(StoppedTurn, "useStoppedTurn");

beforeAll(() => {
  copilotChatSpy.mockImplementation((({
    agentId,
    threadId,
  }: {
    agentId: string;
    threadId?: string;
  }) => (
    <div
      data-agent-id={agentId}
      data-thread-id={threadId}
      data-testid="copilot-chat"
    >
      <textarea aria-label="Chat draft" />
    </div>
  )) as never);

  useActiveBotSpy.mockImplementation((() => undefined) as never);

  useBotThreadSpy.mockImplementation(((agentId: string) => {
    const [revision, setRevision] = useState(0);
    return {
      history: "ready",
      startNew: () => setRevision((value) => value + 1),
      threadId: `thread-${agentId}-${revision}`,
    };
  }) as never);

  useStoppedTurnSpy.mockImplementation((() => null) as never);
});

afterAll(() => {
  copilotChatSpy.mockRestore();
  useActiveBotSpy.mockRestore();
  useBotThreadSpy.mockRestore();
  useStoppedTurnSpy.mockRestore();
});
