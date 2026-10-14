import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const orboDirectory = join(import.meta.dir, "..", "examples", "orbo");

test("includes the complete orbo deployment package example", () => {
  for (const fileName of [
    "brand.yaml",
    "agents.yaml",
    "channels.yaml",
    "model.yaml",
    "knowledge.yaml",
  ]) {
    expect(existsSync(join(orboDirectory, fileName))).toBe(true);
  }

  expect(readFileSync(join(orboDirectory, "brand.yaml"), "utf8")).toContain(
    "id: orbo",
  );
});
