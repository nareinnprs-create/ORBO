import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render } from "@testing-library/react";
import { EvidenceBundle, VersionDiff } from "@/components/gallery/rea";
import { settleReactWork } from "./settle-react-work";

/** The two REA gallery components draw what a Bot hands them: a bundle's files, a diff's colours. */

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

test("an evidence bundle shows its findings and lists its files", () => {
  const view = render(
    <EvidenceBundle
      title="Telegram Android 10.14.2"
      caption="Decompiled with REA"
      summary="The session token is stored unencrypted."
      files={[
        { name: "classes.dex", size: "24.1 MB", note: "Main dex" },
        { name: "lib/arm64-v8a/libtm.so", size: "3.2 MB" },
      ]}
    />,
  );
  expect(
    view.getByText("The session token is stored unencrypted."),
  ).toBeTruthy();
  expect(view.getByText("classes.dex")).toBeTruthy();
  expect(view.getByText("24.1 MB")).toBeTruthy();
  expect(view.getByText("Main dex")).toBeTruthy();
  expect(view.getByText("lib/arm64-v8a/libtm.so")).toBeTruthy();
});

test("an empty bundle says so instead of showing a blank list", () => {
  const view = render(
    <EvidenceBundle title="Nothing kept" summary="No files." files={[]} />,
  );
  expect(view.getByText(/No files recorded/)).toBeTruthy();
});

test("a diff colours added, removed and hunk lines", () => {
  const view = render(
    <VersionDiff
      from="10.14.1"
      to="10.14.2"
      diff={"@@ -1,3 +1,3 @@\n-old\n+new\n keep"}
    />,
  );
  const lines = [...view.container.querySelectorAll("pre")];
  expect(lines).toHaveLength(4);
  expect(lines[0].className).toContain("text-sky-700");
  expect(lines[1].className).toContain("bg-red-500/10");
  expect(lines[2].className).toContain("bg-emerald-500/10");
  expect(lines[3].className).not.toContain("bg-");
});

test("a version label pair is shown beside the title", () => {
  const view = render(<VersionDiff from="1.0" to="1.1" diff="" />);
  expect(view.getByText("1.0 → 1.1")).toBeTruthy();
  expect(view.getByText("No changes.")).toBeTruthy();
});
