/**
 * The live editor session — `dsl.createSession()`, the exact object the VSCode
 * extension drives. Its `analyze` returns findings whose `data` is the rendered
 * Mermaid; `updateFile` and `dependencies` back the extension's live preview.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { dsl } from "../release/render.js";
import { workspace, diagramSource, imports } from "./support.js";

test("analyze returns each diagram's code, name and source file", (t) => {
  const dir = workspace(t, { "d.ts": diagramSource("Overview") });
  const [finding] = dsl.createSession().analyze(join(dir, "d.ts"));

  assert.equal(finding!.label, "Overview");
  assert.match(finding!.range.file, /d\.ts$/);
  assert.match(finding!.data, /^flowchart TD/);
});

test("updateFile makes unsaved buffer content the source of truth", (t) => {
  const dir = workspace(t, { "d.ts": diagramSource("Overview") });
  const path = join(dir, "d.ts");
  const session = dsl.createSession();

  assert.match(session.analyze(path)[0]!.data, /^flowchart TD/);

  // What an editor pushes in for a buffer the user has edited but not saved.
  session.updateFile(
    path,
    diagramSource("Overview").replace('"topdown"', '"leftright"'),
  );
  assert.match(session.analyze(path)[0]!.data, /^flowchart LR/);
});

test("dependencies covers the file plus everything it imports", (t) => {
  const dir = workspace(t, {
    "nodes.ts": `export type Box = { tag: string };\n`,
    "d.ts":
      imports("Flowchart") +
      `import type { Box } from "./nodes.js";\n` +
      `export type Overview = Flowchart.Diagram<"topdown", Box>;\n`,
    "unrelated.ts": `export const nothing = 1;\n`,
  });
  const deps = dsl.createSession().dependencies(join(dir, "d.ts"));

  // A diagram's nodes usually live in other modules — that is exactly why an
  // editor has to watch more than the file it is previewing.
  assert.ok(deps.some((f) => f.endsWith("/d.ts")));
  assert.ok(deps.some((f) => f.endsWith("/nodes.ts")));
  assert.ok(!deps.some((f) => f.endsWith("/unrelated.ts")));
});

test("an imported node type still resolves into the rendered label", (t) => {
  const dir = workspace(t, {
    "nodes.ts": `export type Box = { tag: string };\n`,
    "d.ts":
      imports("Flowchart") +
      `import type { Box } from "./nodes.js";\n` +
      `export type Overview = Flowchart.Diagram<"topdown", Box>;\n`,
  });
  const [finding] = dsl.createSession().analyze(join(dir, "d.ts"));
  assert.equal(finding!.data, `flowchart TD\n    Box["Box<br/>tag: string"]`);
});

test("findings carry a source range for editor surfaces", (t) => {
  const dir = workspace(t, { "d.ts": diagramSource("Overview") });
  const [finding] = dsl.createSession().analyze(join(dir, "d.ts"));

  assert.equal(finding!.id, "Overview");
  // Third line of `diagramSource` (0-based line 2 — imports() is line 0).
  assert.equal(finding!.range.startLine, 2);
  assert.ok(finding!.range.end > finding!.range.start);
});
