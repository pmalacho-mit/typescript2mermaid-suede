import { test } from "node:test";
import assert from "node:assert/strict";
import { dsl, renderFrom } from "../release/render.js";
import { renderAll, workspace, diagramSource, imports } from "./support.js";
import { join } from "node:path";

const PRELUDE = imports("Flowchart") + `type A = {};\n`;

test("only exported aliases are emitted; unexported ones are helpers", () => {
  const names = Object.keys(
    renderAll(`
      type A = {};
      type Body = [Flowchart.Connect<A, A>];
      type Hidden = Flowchart.Diagram<"topdown", Body>;
      export type Shown = Flowchart.Diagram<"topdown", Body>;
    `),
  );
  assert.deepEqual(names, ["Shown"]);
});

test("a shared unexported body can be reused across variants", () => {
  const out = renderAll(`
    type A = {};
    type B = {};
    type Body = [Flowchart.Connect<A, B>];
    export type Light = Flowchart.Diagram<"topdown", Body>;
    export type Dark = Flowchart.Diagram<"topdown", Body, Render.Options<[Render.Theme<"dark">]>>;
  `);
  assert.match(out.Light!, /^flowchart TD\n {4}A --> B$/);
  assert.equal(out.Dark, `%%{init: {'theme':'dark'}}%%\n${out.Light}`);
});

test("the theme prologue appears only when an option asks for it", () => {
  const out = renderAll(`
    type A = {};
    export type Plain = Flowchart.Diagram<"topdown", A>;
    export type Empty = Flowchart.Diagram<"topdown", A, Render.Options<[]>>;
    export type Forest = Flowchart.Diagram<"topdown", A, Render.Options<[Render.Theme<"forest">]>>;
  `);
  assert.equal(out.Plain, "flowchart TD\n    A");
  assert.equal(out.Empty, "flowchart TD\n    A");
  assert.match(out.Forest!, /^%%\{init: \{'theme':'forest'\}\}%%\n/);
});

test("every family dispatches to its own renderer", () => {
  const out = renderAll(`
    type A = {};
    export type F = Flowchart.Diagram<"topdown", A>;
    export type S = Sequence.Diagram<[Sequence.Message<A, A, "hi">]>;
    export type C = Class.Diagram<[Class.Class<A>]>;
    export type St = State.Diagram<[State.Transition<State.Start, A>]>;
    export type E = Entity.Diagram<[Entity.Include<A>]>;
    export type J = Journey.Diagram<"T", [Journey.Section<"S", [Journey.Task<"t", 3, [A]>]>]>;
    export type P = Pie.Diagram<"T", [Pie.Slice<"a", 1>]>;
    export type G = Gantt.Diagram<"T", "YYYY-MM-DD", [Gantt.Section<"S", [Gantt.Task<"t", "id", "2024-01-01", "1d">]>]>;
  `);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(out).map(([name, code]) => [name, code.split("\n")[0]]),
    ),
    {
      F: "flowchart TD",
      S: "sequenceDiagram",
      C: "classDiagram",
      St: "stateDiagram-v2",
      E: "erDiagram",
      J: "journey",
      P: "pie title T",
      G: "gantt",
    },
  );
});

test("an alias naming a diagram is followed to the diagram it points at", () => {
  const out = renderAll(`
    type A = {};
    type Named = Flowchart.Diagram<"leftright", A>;
    export type Indirect = Named;
  `);
  assert.equal(out.Indirect, "flowchart LR\n    A");
});

test("an unknown qualifier is not a diagram and is ignored", () => {
  assert.deepEqual(renderAll(`export type X = Other.Diagram<"topdown", {}>;`), {});
});

test("declarations nested in a namespace keep a qualified id but a plain label", () => {
  const found = dsl.code(
    PRELUDE +
      `export namespace Docs { export type Inner = Flowchart.Diagram<"topdown", A>; }`,
  );
  assert.equal(found.length, 1);
  assert.equal(found[0]!.id, "Docs.Inner");
  assert.equal(found[0]!.label, "Inner");
});

test("gates prefilter documents that cannot declare anything", () => {
  assert.deepEqual(dsl.gates, ["Diagram<"]);
  assert.deepEqual(dsl.code(`export type X = 1;`), []);
});

test("renderFrom.files reports each diagram's source path", (t) => {
  const dir = workspace(t, {
    "a.ts": diagramSource("First"),
    "nested/b.ts": diagramSource("Second"),
  });
  const found = renderFrom.files([join(dir, "a.ts"), join(dir, "nested/b.ts")]);
  assert.deepEqual(found.map((d) => d.name), ["First", "Second"]);
  assert.match(found[1]!.file, /nested\/b\.ts$/);
});

test("a malformed diagram fails with the offending source located", () => {
  assert.throws(
    () => renderAll(`export type X = Journey.Diagram<"T", [{}]>;`),
    (error: Error) => {
      assert.match(error.message, /^typescript2mermaid: /);
      assert.match(error.message, /Section<> entries/);
      assert.match(error.message, /diagram\.ts:\d+/);
      return true;
    },
  );
});
