import { expect, test } from "bun:test";

function pageExcerpt(content: string) {
  return content
    .replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/gm, "")
    .replace(/```[\s\S]*?```/g, "Code block")
    .replace(/!?\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`|~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
}

test("shows readable library previews without changing source content", () => {
  const source =
    "---\ntitle: Metadata\n---\n\n# Checklist\n- [ ] First task\n- [x] **Done**\n\n<details><summary>Context</summary>Notes</details>";
  expect(pageExcerpt(source)).toBe("Checklist First task Done Context Notes");
  expect(source).toContain("<details>");
  expect(source).toContain("- [ ]");
});
