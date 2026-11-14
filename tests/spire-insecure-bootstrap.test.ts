import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guard the SPIRE configs get instead of a runtime one (Batch 7a, item 8).
 *
 * `config.ts` refuses development tokens the moment a deployment binds beyond loopback, because at
 * runtime the server can see what it is about to trust. Nothing here reads `spire/*.conf` at
 * runtime — the supervisor's identity registration is switched on by `SPIRE_SOCKET` and speaks to
 * the agent through its socket, and these files are inputs to how a deployment RUNS SPIRE, not to
 * how the server starts. So the pattern is mirrored at the only place it can be: a test that holds
 * the local-only default to its own documentation.
 *
 * The property: `insecure_bootstrap = true` — the agent trusting the server's bundle on first
 * contact — may ship only as the local-development default, with the comment that says so beside
 * it and the production variant (attested bootstrap, bundle out of band) described in the
 * deployment docs. Anybody flipping this setting into a "production" agent.conf, or deleting the
 * warning on their way past, breaks this suite and has to say what they meant.
 */

const repoRoot = join(import.meta.dir, "..");

const agentConf = readFileSync(join(repoRoot, "spire", "agent.conf"), "utf8");
const serverConf = readFileSync(join(repoRoot, "spire", "server.conf"), "utf8");
const deploymentDocs = readFileSync(
  join(repoRoot, "docs", "deployment.md"),
  "utf8",
);

describe("the SPIRE agent's insecure bootstrap", () => {
  test("is on, because the shipped shape is the local development one", () => {
    expect(agentConf).toMatch(/insecure_bootstrap\s*=\s*true/);
  });

  test("says beside itself that it is local-only, and names the production attestation", () => {
    // The comment is the load-bearing half: the setting is one word to flip, and the reason not to
    // flip it in production has to live where the flip happens.
    expect(agentConf).toMatch(/Local bootstrap only/i);
    expect(agentConf).toMatch(/hardware attestor|x509pop|instance identity/i);
  });

  test("is described in the deployment docs, production variant included", () => {
    // Docs that can vanish silently protect nothing, so the note's existence is pinned for as long
    // as the setting is true.
    expect(deploymentDocs).toMatch(/insecure_bootstrap/);
    expect(deploymentDocs).toMatch(/insecure_bootstrap = false/);
  });

  test("nowhere in the server's config, which holds the trust bundle root", () => {
    // The server IS the thing being trusted on first contact; it has nothing to bootstrap from.
    expect(serverConf).not.toMatch(/insecure_bootstrap/);
  });
});
