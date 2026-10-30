import { expect, test } from "bun:test";
import { router } from "../src/router";
import {
  routeBuildCodeSplitting,
  routeCodeSplittingOptions,
  selectedRouteSplitBehavior,
  selectORBOManualChunk,
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

test("uses explicit code-splitting groups for route components", () => {
  // Dependencies must not be pulled into route chunks recursively — that is Rolldown's
  // default and it would move shared vendor code into whichever route loads it first.
  expect(routeBuildCodeSplitting.includeDependenciesRecursively).toBe(false);
  expect(routeBuildCodeSplitting.groups.map((group) => group.name)).toEqual([
    "route-sign",
    "route-chat-core",
    "route-admin",
    "route-settings",
    "route-app-secondary",
  ]);
  for (const group of routeBuildCodeSplitting.groups) {
    expect(
      group.test("/repo/app/src/components/markdown/lazy-mermaid.tsx"),
    ).toBe(false);
  }
  expect(
    routeBuildCodeSplitting.groups.find((group) =>
      group.test("/repo/app/src/routes/sign.tsx?tsr-split=component"),
    )?.name,
  ).toBe("route-sign");
  expect(
    routeBuildCodeSplitting.groups.find((group) =>
      group.test(
        "C:\\repo\\app\\src\\routes\\_authed\\admin\\credentials.tsx?tsr-split=component",
      ),
    )?.name,
  ).toBe("route-admin");
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
