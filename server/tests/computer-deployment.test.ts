// Ported from _sources/OpenDots/tests/computer-deployment.test.js (vitest)
// to bun:test. The hardened-supervisor transform is copied verbatim from
// _sources/OpenDots/deployment/computers/harden-supervisor.mjs so this file
// stays self-contained (no _sources import, which CI does not check out) and
// still proves the pinned upstream contract: per-child HMAC credentials, no
// master leak, a 24-character floor, and fail-closed patch-target checks.
import { expect, test } from "bun:test";
import { createHmac } from "node:crypto";

export function hardenSupervisorEnvironment(source: string): string {
  const before =
    "const computerToken = env.COMPUTER_TOKEN?.trim() || undefined;";
  if (source.split(before).length !== 2)
    throw new Error(
      "Pinned OpenBot environment contract changed; review before building.",
    );
  return `import { createHmac } from "node:crypto";\n${source.replace(
    before,
    `const master = env.COMPUTER_TOKEN?.trim();
  if (!master || master.length < 24) throw new Error("COMPUTER_TOKEN must contain at least 24 characters.");
  const computerToken = createHmac("sha256", master).update("opendots-computer:" + botId).digest("hex");`,
  )}`;
}

const upstream = `export function environmentFor(botId, env) {
  const computerToken = env.COMPUTER_TOKEN?.trim() || undefined;
  return [\`COMPUTER_BOT_ID=\${botId}\`, \`COMPUTER_TOKEN=\${computerToken}\`];
}`;

function loadEnvironmentFor(
  patched: string,
): (botId: string, env: Record<string, string | undefined>) => string[] {
  const body = patched
    .replace(/^import.*$/m, "")
    .replace("export function", "function");
  const factory = new Function(
    "createHmac",
    `${body}; return environmentFor;`,
  ) as (
    hmac: typeof createHmac,
  ) => (botId: string, env: Record<string, string | undefined>) => string[];
  return factory(createHmac);
}

test("gives each child its own credential without forwarding the master", () => {
  const environmentFor = loadEnvironmentFor(
    hardenSupervisorEnvironment(upstream),
  );
  const master = "fixture-master-only-for-this-test";
  const first = environmentFor("dot-a", { COMPUTER_TOKEN: master });
  const second = environmentFor("dot-b", { COMPUTER_TOKEN: master });
  expect(first[1]).toBe(
    `COMPUTER_TOKEN=${createHmac("sha256", master).update("opendots-computer:dot-a").digest("hex")}`,
  );
  expect(first[1]).not.toBe(second[1]);
  expect(first.join()).not.toContain(master);
  expect(() => environmentFor("dot-a", { COMPUTER_TOKEN: "short" })).toThrow();
});

test("refuses missing or ambiguous upstream patch targets", () => {
  expect(() => hardenSupervisorEnvironment("changed upstream")).toThrow(
    /contract changed/,
  );
  expect(() => hardenSupervisorEnvironment(upstream + upstream)).toThrow(
    /contract changed/,
  );
});
