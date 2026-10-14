import { expect, test } from "bun:test";
import { Glob } from "bun";
import ts from "typescript";

/**
 * Every `<form onSubmit>` has something that submits it.
 *
 * Base UI's `Button` renders `type="button"` unless told otherwise, so a `<Button>` that looks like
 * a form's submit does nothing when pressed, and the form's own tests still pass because they fire
 * `submit` on the form directly. That shipped four dead forms at once (Remember, Add and sync
 * source, Confirm phone, Turn on background research) and the recorder before them. A plain
 * `<button>` defaults to submit, so it counts; a `<Button>` counts only with `type="submit"`.
 *
 * A submit control outside the form counts when it names the form: `form={id}` matching the form's
 * own `id={id}`. A dialog does this to keep its submit in `DialogFooter` while `DialogBody` stays a
 * direct child of `DialogContent`.
 *
 * A form submitted some other way (the composer's Enter key and send action) names itself here with
 * a reason, rather than every form losing the check.
 */
const SUBMITTED_ELSEWHERE = new Set([
  // Enter submits through the editor, and the send action is its own typed control.
  "src/components/channels/composer/composer.tsx",
]);

function attribute(
  node: ts.JsxOpeningLikeElement,
  name: string,
  source: ts.SourceFile,
) {
  return node.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText(source) === name,
  );
}

function submits(
  node: ts.JsxOpeningLikeElement,
  source: ts.SourceFile,
): boolean {
  const tag = node.tagName.getText(source);
  const type = attribute(node, "type", source)?.initializer;
  const typeText =
    type && ts.isStringLiteral(type)
      ? type.text
      : type && ts.isJsxExpression(type) && type.expression
        ? type.expression.getText(source).replace(/["'`]/g, "")
        : undefined;
  if (tag === "button") return typeText === undefined || typeText === "submit";
  if (tag === "input") return typeText === "submit";
  return typeText === "submit";
}

test("every form with an onSubmit has a control that submits it", async () => {
  const dead: string[] = [];
  for await (const file of new Glob("src/**/*.tsx").scan(
    `${import.meta.dir}/..`,
  )) {
    const relative = file.replaceAll("\\", "/");
    if (SUBMITTED_ELSEWHERE.has(relative)) continue;
    const text = await Bun.file(`${import.meta.dir}/../${relative}`).text();
    // A `<form>` JSX element can only exist in a file containing the literal text
    // `<form`, so skip parsing the ~190 files that cannot hold one. The assertion
    // is unchanged; this only avoids creating an AST for files with no form.
    if (!text.includes("<form")) continue;
    const source = ts.createSourceFile(
      relative,
      text,
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.TSX,
    );
    /** The `form` attribute of every submit control in the file, as written. */
    const named = new Set<string>();
    const collect = (node: ts.Node) => {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        submits(node, source)
      ) {
        const form = attribute(node, "form", source)?.initializer;
        if (form) named.add(form.getText(source));
      }
      ts.forEachChild(node, collect);
    };
    collect(source);
    const visit = (node: ts.Node) => {
      if (
        ts.isJsxElement(node) &&
        node.openingElement.tagName.getText(source) === "form" &&
        attribute(node.openingElement, "onSubmit", source)
      ) {
        const id = attribute(node.openingElement, "id", source)?.initializer;
        let found = id !== undefined && named.has(id.getText(source));
        const inside = (child: ts.Node) => {
          if (found) return;
          if (
            (ts.isJsxOpeningElement(child) ||
              ts.isJsxSelfClosingElement(child)) &&
            submits(child, source)
          )
            found = true;
          ts.forEachChild(child, inside);
        };
        ts.forEachChild(node, inside);
        if (!found) {
          const { line } = source.getLineAndCharacterOfPosition(
            node.getStart(source),
          );
          dead.push(`${relative}:${line + 1}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect(dead).toEqual([]);
}, 30_000);
