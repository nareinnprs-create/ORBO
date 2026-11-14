import { describe, expect, test } from "bun:test";
import { createMemoryMiner } from "../src/memory/miner";

function respondWith(body: unknown, status = 200) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? "{}")),
    });
    return new Response(
      typeof body === "string" ? body : JSON.stringify(body),
      { status },
    );
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe("asking the model for facts", () => {
  test("sends the excerpt to the deployment's own model and reads the facts", async () => {
    const { calls, fetchImpl } = respondWith({
      choices: [
        {
          message: {
            content:
              '{"facts":["The person files expenses on Fridays","The person is in Berlin"]}',
          },
        },
      ],
    });

    const facts = await createMemoryMiner({
      model: "gpt-4.1-mini",
      resolveApiKey: async () => "key-123",
      environment: {},
      fetchImpl,
    })("person: which receipts count as travel?");

    expect(facts).toEqual([
      "The person files expenses on Fridays",
      "The person is in Berlin",
    ]);
    expect(calls[0]?.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(calls[0]?.body.model).toBe("gpt-4.1-mini");
  });

  test("reads the JSON out of a fenced answer", async () => {
    const { fetchImpl } = respondWith({
      choices: [
        {
          message: {
            content:
              'Here you go:\n```json\n{"facts":["The person prefers morning meetings"]}\n```',
          },
        },
      ],
    });

    const facts = await createMemoryMiner({
      model: "gpt-4.1-mini",
      resolveApiKey: async () => "key-123",
      fetchImpl,
    })("person: when do we meet?");

    expect(facts).toEqual(["The person prefers morning meetings"]);
  });

  test("prose with no JSON is an answer of no facts, not a failure", async () => {
    const { fetchImpl } = respondWith({
      choices: [{ message: { content: "Nothing durable was said." } }],
    });

    const facts = await createMemoryMiner({
      model: "gpt-4.1-mini",
      resolveApiKey: async () => "key-123",
      fetchImpl,
    })("person: hi");

    expect(facts).toEqual([]);
  });

  test("a facts key that is not an array is no facts", async () => {
    const { fetchImpl } = respondWith({
      choices: [{ message: { content: '{"facts":"everything"}' } }],
    });

    const facts = await createMemoryMiner({
      model: "gpt-4.1-mini",
      resolveApiKey: async () => "key-123",
      fetchImpl,
    })("person: hi");

    expect(facts).toEqual([]);
  });

  test("non-string entries are dropped, not fatal", async () => {
    const { fetchImpl } = respondWith({
      choices: [
        { message: { content: '{"facts":["kept",42,null,"kept too"]}' } },
      ],
    });

    const facts = await createMemoryMiner({
      model: "gpt-4.1-mini",
      resolveApiKey: async () => "key-123",
      fetchImpl,
    })("person: hi");

    expect(facts).toEqual(["kept", "kept too"]);
  });

  test("asks nothing at all when the deployment has no key", async () => {
    const { calls, fetchImpl } = respondWith({});

    const facts = await createMemoryMiner({
      model: "gpt-4.1-mini",
      resolveApiKey: async () => null,
      fetchImpl,
    })("person: hi");

    // Not a failure. A deployment with no model configured does not mine conversations, and must
    // not spend a request finding that out on every pass.
    expect(facts).toBeNull();
    expect(calls).toHaveLength(0);
  });

  test("throws when the provider refuses, so the work is tried again", async () => {
    const { fetchImpl } = respondWith("rate limited", 429);

    await expect(
      createMemoryMiner({
        model: "gpt-4.1-mini",
        resolveApiKey: async () => "key-123",
        fetchImpl,
      })("person: hi"),
    ).rejects.toThrow("429");
  });

  test("carries only one line of the provider's complaint", async () => {
    const { fetchImpl } = respondWith(
      "<html>\n  <body>Too many requests</body>\n</html>",
      503,
    );

    // The message ends up on the work item as the reason it was released, so a provider that
    // answers with a page of HTML must not put that page in the database.
    const thrown = await createMemoryMiner({
      model: "gpt-4.1-mini",
      resolveApiKey: async () => "key-123",
      fetchImpl,
    })("person: hi").catch((error: Error) => error.message);

    expect(thrown).not.toContain("\n");
  });

  test("braces that do not parse throw, so the queue retries", async () => {
    const { fetchImpl } = respondWith({
      choices: [{ message: { content: '{"facts": [broken]}' } }],
    });

    await expect(
      createMemoryMiner({
        model: "gpt-4.1-mini",
        resolveApiKey: async () => "key-123",
        fetchImpl,
      })("person: hi"),
    ).rejects.toThrow();
  });
});
