import { expect, test } from "bun:test";
import { notificationDestination } from "../../mobile/src/links";

test("native push opens only known screens and preserves canonical owner-scoped conversation IDs", () => {
  expect(
    notificationDestination({
      url: "orbomobile://conversation?channelId=channel",
    }),
  ).toEqual({ pathname: "/conversation", params: { channelId: "channel" } });
  expect(
    notificationDestination({
      url: "orbomobile://approvals?channelId=channel&requestId=q1",
    }),
  ).toEqual({
    pathname: "/approvals",
    params: { channelId: "channel", requestId: "q1" },
  });
  for (const url of [
    "https://evil.test",
    "orbomobile://attacker?channelId=c",
    "orbomobile://conversation/evil?channelId=c",
    "orbomobile://conversation",
    "orbomobile://user:password@conversation?channelId=c",
  ])
    expect(notificationDestination({ url })).toBeNull();
});
