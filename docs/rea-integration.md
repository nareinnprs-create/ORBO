# REA integration

REA agents expose a reverse-engineering workbench to ORBO's Bots as an MCP server: a Bot can read
a target binary or app package, get pseudocode and call graphs back, inspect Electron/ASAR and
JavaScript bundles, diff two versions of a package, and collect an evidence bundle it can cite.

This page is about what that enables, what it cannot do, and what an operator has to stand up to
offer it. The catalogue entry is `rea` in `server/src/plugins/catalogue.ts`.

## What it enables

With the `rea` connector granted to a Bot, the Bot can ask, in a conversation or a routine:

- **Pseudocode and structure reads** — decompile functions, list imports and exports, and walk
  call graphs of native binaries through the session and native tool families.
- **ASAR / JavaScript analysis** — open an Electron app's `app.asar`, list and read its modules,
  and trace what a JavaScript bundle does, through the artifact family.
- **Application-level reads** — package metadata, entitlements, manifest and configuration
  inspection for an installed application, through the application family.
- **Version diffs** — compare two builds of the same package and answer "what changed between
  1.2.3 and 1.2.4", the question a supply-chain review actually asks, through the enhanced family.
- **Evidence bundles** — collect the reads above into one citable bundle, so a Bot's findings in a
  security review point at artifacts rather than at its own summary of them.

## What it cannot do here

REA's other tool families — **frida, adb, browser, electron and javascript-runtime** — are
side-effectful: they inject into live processes, drive attached devices, drive a browser, and
execute code. ORBO does not expose them as reads.

Two layers hold that line, and both are required:

1. **At the source.** The deployment runs the REA server with `REA_MCP_TOOL_FAMILIES` naming only
   the read-safe families (below). The server then offers nothing else to list.
2. **At ORBO.** The `rea` catalogue entry sets `unknownToolsAreWrites`, so every tool the server
   advertises is classified as a **write**, whatever its name and whatever the listing claims. In
   ORBO, a write goes to the approvals gateway the same as any other write: the person's
   ask-before-changes setting, their personal rules, auto-review and the team rules all apply, and
   a Bot calling a REA tool without an allowing rule leaves a pending approval row. A
   misconfigured REA that starts advertising side-effectful families therefore lands behind
   approvals instead of walking through as reads.

Ghidra, Hopper and IDA are **bring-your-own external tools**: REA invokes them where they are
installed on the same machine and licenses them, and ORBO never sees or manages those
installations.

## Setup

1. **Run REA locally, behind an HTTP bridge.** The REA MCP server is a stdio process. ORBO dials
   MCP over Streamable HTTP, so front it with any stdio-to-StreamableHTTP bridge on the same
   machine, restricted to loopback:

   ```sh
   npx -y rea-agents@<pinned-version> mcp
   #   with, at minimum:
   #   REA_MCP_TOOL_FAMILIES=session,native,artifact,application,enhanced
   #   REA_MCP_MAX_RESPONSE_BYTES=<a cap your reverse proxy can carry, e.g. 2097152>
   ```

   The bridge must serve the MCP endpoint at `http://127.0.0.1:<port>/mcp` and enforce a bearer
   token. Port and token are the deployment's own; the catalogue entry pins the host to loopback
   by pattern and accepts the port from the administrator enabling it.

2. **Store the bearer token.** `POST /api/admin/credentials` with `kind: "mcp"`, any provider and
   key id you will recognise (for example `rea`/`rea`), and the token in `plaintext`.

3. **Enable the connector.** Add the `rea` server from the catalogue at the admin plugins page,
   giving the loopback host (`http://127.0.0.1:<port>`) as the instance host and the credential
   from step 2. Nothing is granted yet.

4. **Grant per Bot.** As with every connector, enabling `rea` grants nothing. An administrator
   grants individual tools to individual Bots, and a person can write an approval rule (for
   example `rea/session_*`, allow) if they want particular reads to stop asking.

## Sandbox warning

Run hostile targets isolated. Analysis of untrusted binaries is work with hostile material: the
Ghidra/Hopper/IDA pipelines, archive extractors and parser stacks behind REA all process
attacker-controlled input. Run the REA process in a container or VM with no credentials, no
network route to anything you care about, and nothing on disk you would mind losing; treat
anything a REA tool returns as untrusted data (ORBO already does — connector results are marked
untrusted in the transcript and are never instructions). Never point the frida/adb families at a
device you use, which is one more reason they are excluded here.

## Platform matrix

| Component | Linux | Windows | macOS |
| --- | --- | --- | --- |
| REA MCP server (read-safe families) | Solid (container path) | Experimental | Untested |
| Ghidra headless | Solid | Solid | Solid |
| Hopper | Solid | Untested | Solid |
| IDA | BYO license | BYO license | BYO license |
| ASAR/JS artifact reads | Solid | Solid | Solid |

Notes:

- The **Linux container path is the solid one**: the deployment's own container image already
  carries the toolchain REA's native family shells out to, and running REA beside it on loopback
  is the documented topology. Prefer it for anything unattended.
- **Windows is experimental**: the native family works, but the disassembler invocations and path
  handling around `Program Files` have not been exercised the way the container path has.
- Ghidra/Hopper/IDA are the operator's own installs and licenses wherever they run; REA calls them
  where it finds them and this deployment never manages them.
