import { expect, test } from "bun:test";
import { router } from "../src/router";
import {
  routeBuildRollupOutputOptions,
  routeCodeSplittingOptions,
  selectORBOManualChunk,
  selectedRouteSplitBehavior,
} from "../vite.config";

test("provides the generated index route", () => {
  expect(router.routesByPath["/"]?.fullPath).toBe("/");
});

test("provides the generated sign-in and chat routes", () => {
  expect(router.routesByPath["/sign"]?.fullPath).toBe("/sign");
  expect(router.routesByPath["/channel/$channelId"]?.fullPath).toBe(
    "/channel/$channelId",
  );
});

test("provides the protected credential administration route", () => {
  expect(router.routesByPath["/admin/credentials"]?.fullPath).toBe(
    "/admin/credentials",
  );
});

test("splits route components without splitting loaders or providers", () => {
  expect(routeCodeSplittingOptions.defaultBehavior).toEqual([]);
  expect(selectedRouteSplitBehavior({ routeId: "/sign" })).toEqual([
    ["component"],
  ]);
  expect(
    selectedRouteSplitBehavior({ routeId: "/_authed/_app/channel/$channelId" }),
  ).toEqual([["component"]]);
  expect(selectedRouteSplitBehavior({ routeId: "/admin/credentials" })).toEqual(
    [["component"]],
  );
  expect(
    selectedRouteSplitBehavior({ routeId: "/settings/connected-accounts/" }),
  ).toEqual([["component"]]);
  expect(selectedRouteSplitBehavior({ routeId: "/" })).toBeUndefined();
});

test("uses explicit manual chunks for route components", () => {
  expect(routeBuildRollupOutputOptions.onlyExplicitManualChunks).toBe(true);
  expect(
    selectORBOManualChunk("/repo/app/src/routes/sign.tsx?tsr-split=component"),
  ).toBe("route-sign");
  expect(
    selectORBOManualChunk(
      "C:\\repo\\app\\src\\routes\\_authed\\_app\\channel\\$channelId.tsx?tsr-split=component",
    ),
  ).toBe("route-chat-core");
  expect(
    selectORBOManualChunk(
      "/repo/app/src/routes/_authed/admin/credentials.tsx?tsr-split=component",
    ),
  ).toBe("route-admin");
  expect(
    selectORBOManualChunk(
      "/repo/app/src/routes/_authed/settings/connected-accounts/index.tsx?tsr-split=component",
    ),
  ).toBe("route-settings");
  expect(
    selectORBOManualChunk(
      "/repo/app/src/routes/_authed/_app/agents/index.tsx?tsr-split=component",
    ),
  ).toBe("route-app-secondary");
});

test("does not manually chunk lazy content or dependencies", () => {
  expect(
    selectORBOManualChunk(
      "/repo/app/src/routes/_authed/_app/channel/$channelId.tsx?tsr-split=loader",
    ),
  ).toBeUndefined();
  expect(
    selectORBOManualChunk("/repo/app/src/components/markdown/lazy-mermaid.tsx"),
  ).toBeUndefined();
  expect(
    selectORBOManualChunk(
      "/repo/node_modules/.bun/mermaid@11.12.1/node_modules/mermaid/dist/mermaid.core.mjs",
    ),
  ).toBeUndefined();
  expect(
    selectORBOManualChunk(
      "/repo/node_modules/.bun/@copilotkit+react-core@1.70.1/node_modules/@copilotkit/react-core/dist/index.js",
    ),
  ).toBeUndefined();
  expect(
    selectORBOManualChunk(
      "/repo/node_modules/.bun/react-dom@19.2.0/node_modules/react-dom/client.js",
    ),
  ).toBeUndefined();
});
