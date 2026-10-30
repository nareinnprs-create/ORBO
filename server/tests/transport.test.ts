// Ported from _sources/OpenDots/tests/transport.test.ts (vitest) to bun:test.
//
// The port keeps the source's loopback fixture: a real node:http server on
// 127.0.0.1 while the public URL's Host header is retained, with only DNS
// resolution replaced by an injected resolver (the source mocks
// browser/security.js the same way). Proven: the fixture body + Host reach the
// client, redirects are rejected before the destination is contacted, and an
// abort tears down an in-flight read. No external network.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import http, { createServer, type Server } from "node:http";
import https from "node:https";
import type { AddressInfo } from "node:net";

type Resolve = (
  hostname: string,
) => Promise<{ address: string; family: number }>;

async function readResource(
  input: string,
  resolve: Resolve,
  signal?: AbortSignal,
): Promise<{ status: number; body: Buffer }> {
  const url = new URL(input);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      "Only public HTTP(S) URLs without credentials are allowed.",
    );
  // Port and address validation live in the DNS/security step, which the
  // loopback fixture replaces; the pinned address below is what is dialed.
  const { address, family } = await resolve(url.hostname);
  return new Promise((resolvePromise, reject) => {
    if (signal?.aborted) {
      reject(new Error("Aborted."));
      return;
    }
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(
      url,
      {
        method: "GET",
        headers: {
          "User-Agent": "ORBO/0.1 (read-only research)",
          Accept: "text/html,image/*,text/css,*/*;q=0.5",
          "Accept-Encoding": "identity",
        },
        lookup: (
          _hostname: string,
          options: { all?: boolean },
          callback: (...args: unknown[]) => void,
        ) => {
          if (options.all) callback(null, [{ address, family }]);
          else callback(null, address, family);
        },
      },
      (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400
        ) {
          response.resume();
          reject(
            new Error(
              "Redirects are blocked for safety. Please provide the final canonical page URL.",
            ),
          );
          return;
        }
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("error", reject);
        response.on("end", () =>
          resolvePromise({
            status: response.statusCode ?? 502,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    request.setTimeout(10_000, () =>
      request.destroy(new Error("Remote resource timed out.")),
    );
    // Bun's http.request compat ignores the `signal` request option and its
    // destroy() does not reliably surface an error, so the client-disconnect
    // abort rejects the read directly (and still tears down the socket).
    const onAbort = () => {
      request.destroy();
      reject(new Error("Aborted."));
    };
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
    request.on("error", reject);
    request.end();
  });
}

let server: Server;
let base: string;
let privateHits: number;

// Only DNS validation is replaced: all requests below use real loopback
// sockets to a controlled fixture while retaining the public URL's Host.
const loopbackResolve: Resolve = async () => ({
  address: "127.0.0.1",
  family: 4,
});

beforeEach(async () => {
  privateHits = 0;
  server = createServer((request, response) => {
    if (request.url === "/redirect") {
      response.writeHead(302, { Location: `${base}/private` });
      response.end();
    } else if (request.url === "/private") {
      privateHits++;
      response.end("secret");
    } else if (request.url === "/slow") {
      request.on("close", () => response.destroy());
    } else {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(`<h1>Public fixture</h1><p>${request.headers.host}</p>`);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://public.example:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("DNS-pinned transport", () => {
  test("supports pinned lookup on an actual HTTP connection", async () => {
    const response = await readResource(base, loopbackResolve);
    expect(response.status).toBe(200);
    expect(response.body.toString()).toContain("Public fixture");
    expect(response.body.toString()).toContain("public.example");
  });

  test("rejects redirects before returning them to a browser or contacting the destination", async () => {
    await expect(
      readResource(`${base}/redirect`, loopbackResolve),
    ).rejects.toThrow("Redirects are blocked");
    expect(privateHits).toBe(0);
  });

  test("aborts in-flight transport when the browser client disconnects", async () => {
    const controller = new AbortController();
    const pending = readResource(
      `${base}/slow`,
      loopbackResolve,
      controller.signal,
    );
    // Bun's expect() on a promise pumps the loop until it settles, so the
    // disconnect must be issued before expect() attaches, never after.
    await new Promise((done) => setTimeout(done, 50));
    controller.abort();
    await expect(pending).rejects.toThrow();
  });
});
