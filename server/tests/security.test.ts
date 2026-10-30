import { describe, expect, test } from "bun:test";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPublicAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || b === 2)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0)
    );
  }
  if (isIP(ip) === 6) {
    const normalized = new URL(`http://[${ip}]`).hostname.slice(1, -1);
    const second = Number.parseInt(normalized.split(":")[1] || "0", 16);
    if (normalized.startsWith("2001:") && second < 0x200) return false;
    return (
      /^[23][0-9a-f]{3}:/.test(normalized) &&
      !/^(2001:(0:|db8:|10:|20:)|2002:)/.test(normalized)
    );
  }
  return false;
}

async function validateUrl(
  input: string,
): Promise<{ url: URL; address: string; family: number }> {
  const url = new URL(input);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      "Only public HTTP(S) URLs without credentials are allowed.",
    );
  if (url.port && !["80", "443"].includes(url.port))
    throw new Error("Only standard web ports are allowed.");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  )
    throw new Error("Local addresses are blocked.");
  const addresses = await lookup(hostname, { all: true });
  if (
    !addresses.length ||
    addresses.some((item) => !isPublicAddress(item.address))
  )
    throw new Error("Private or special network addresses are blocked.");
  return { url, ...addresses[0] };
}

describe("browser network boundaries", () => {
  test.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.0.1",
    "169.254.169.254",
    "0.0.0.0",
    "::1",
    "2001::1",
    "2001:100::1",
    "2002:7f00:1::",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "224.0.0.1",
  ])("rejects private or special address %s", (address) =>
    expect(isPublicAddress(address)).toBe(false),
  );

  test.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
    "accepts public address %s",
    (address) => expect(isPublicAddress(address)).toBe(true),
  );

  test("rejects non-http URLs and embedded credentials", async () => {
    await expect(validateUrl("file:///etc/passwd")).rejects.toThrow();
    await expect(
      validateUrl("https://user:pass@example.com"),
    ).rejects.toThrow();
    await expect(validateUrl("http://127.0.0.1")).rejects.toThrow();
  });
});
