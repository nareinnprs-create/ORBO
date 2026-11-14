/**
 * One model call for the facts a conversation is worth keeping. Not a Bot and not a turn: a fact
 * is not said to anybody and is not part of the conversation it came from, so there is no runtime
 * work and no thread to hold.
 */

import { oneLine } from "../channels/text";
import { chatCompletionsUrl } from "../routing/model";

/** Rules, not an example: a model copies an example's wording as readily as its shape. */
const INSTRUCTION = [
  "You remember facts about a person, for a personal memory the person later reviews.",
  "Read the conversation and answer with the durable facts it reveals: preferences, standing decisions, background, ongoing work, people and things that matter to them.",
  "Leave out anything already stale or trivially temporary, and leave out the conversation's scaffolding (greetings, small talk, your own suggestions).",
  "Write each fact as one short third-person sentence from the person's point of view, e.g. 'The person files expenses on Fridays'.",
  "Answer with JSON only: an object with one key `facts`, a possibly empty array of strings.",
].join(" ");

export type MemoryMinerOptions = {
  /** The model to ask, from the tenant package. */
  model: string;
  /** Resolved per call, so a rotated credential is picked up without a restart. */
  resolveApiKey: () => Promise<string | null>;
  environment?: Record<string, string | undefined>;
  /** Injectable so a test drives this without a network. */
  fetchImpl?: typeof fetch;
  /** How long one call may take before it is given up on. */
  timeoutMs?: number;
};

/** The raw facts, as the model said them. Filtering and capping are the sweep's job. */
export type MemoryMiner = (excerpt: string) => Promise<string[] | null>;

/** No key resolves to null and is not retried; a provider error throws, so the queue retries it. */
export function createMemoryMiner(options: MemoryMinerOptions) {
  const call = options.fetchImpl ?? fetch;

  return async (excerpt: string): Promise<string[] | null> => {
    const apiKey = await options.resolveApiKey();
    if (!apiKey) return null;

    const response = await call(
      chatCompletionsUrl(options.environment ?? process.env),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: options.model,
          messages: [
            { role: "system", content: INSTRUCTION },
            { role: "user", content: excerpt },
          ],
          // Reasoning tokens come out of this budget, so a cap sized for the answer alone 400s.
          max_completion_tokens: 1024,
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      },
    );

    if (!response.ok) {
      // Capped: this lands on the work item's row, and an HTML error page would land there whole.
      const detail = oneLine(await response.text().catch(() => ""), 200);
      throw new Error(
        `The model refused to mine a conversation: ${response.status} ${detail}`.trim(),
      );
    }

    const body = (await response.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;
    return parseFacts(content);
  };
}

/**
 * The `facts` array out of the answer, fences and prose around it notwithstanding.
 *
 * No brace at all is prose saying nothing was worth keeping, which is an answer of zero facts, not
 * a failure. Braces that fail to parse throw: the queue retries, and a model that cannot emit the
 * shape it was asked for has not answered.
 */
function parseFacts(content: string): string[] {
  const start = content.indexOf("{");
  if (start === -1) return [];
  const end = content.lastIndexOf("}");
  if (end <= start) return [];
  const parsed = JSON.parse(content.slice(start, end + 1)) as unknown;
  const facts = (parsed as { facts?: unknown }).facts;
  if (!Array.isArray(facts)) return [];
  return facts.filter((fact): fact is string => typeof fact === "string");
}
