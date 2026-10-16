import { expect, test } from "bun:test";
import { notificationDestination } from "../../mobile/src/links";

test("native push opens only known screens and preserves canonical owner-scoped conversation IDs", () => {
  for (const scheme of ["orbo", "orbomobile"]) {
    expect(
      notificationDestination({
        url: `${scheme}://conversation?channelId=channel`,
      }),
    ).toEqual({ pathname: "/conversation", params: { channelId: "channel" } });
    expect(
      notificationDestination({
        url: `${scheme}://approvals?channelId=channel&requestId=q1`,
      }),
    ).toEqual({
      pathname: "/approvals",
      params: { channelId: "channel", requestId: "q1" },
    });
  }
  // D16: `orbo:` is canonical; `orbomobile:` is accepted for one release.
  for (const url of [
    "https://evil.test",
    "orbo://attacker?channelId=c",
    "orbomobile://attacker?channelId=c",
    "orbo://conversation/evil?channelId=c",
    "orbomobile://conversation/evil?channelId=c",
    "orbo://conversation",
    "orbomobile://conversation",
    "orbo://user:password@conversation?channelId=c",
    "orbomobile://user:password@conversation?channelId=c",
  ])
    expect(notificationDestination({ url })).toBeNull();
});
