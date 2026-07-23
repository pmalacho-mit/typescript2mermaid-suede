import { test } from "node:test";
import assert from "node:assert/strict";
import { render, lines } from "../support.js";

const NODES = `type A = {}; type B = {}; type C = {};\n`;

test("direction words map to Mermaid's two-letter codes", () => {
  const of = (dir: string) =>
    render(`${NODES}export type X = Flowchart.Diagram<"${dir}", A>;`).split("\n")[0];
  assert.equal(of("topdown"), "flowchart TD");
  assert.equal(of("bottomup"), "flowchart BT");
  assert.equal(of("leftright"), "flowchart LR");
  assert.equal(of("rightleft"), "flowchart RL");
});

test("a node's label expands its resolved type, members and all", () => {
  const code = render(`
    type Api = { url: string; retries: number };
    export type X = Flowchart.Diagram<"topdown", Api>;
  `);
  assert.equal(code, `flowchart TD\n    Api["Api<br/>url: string<br/>retries: number"]`);
});

test("Node<> chooses shape, custom label, or bare name", () => {
  const code = render(`
    type A = { id: string };
    type B = { id: string };
    type C = { id: string };
    export type X = Flowchart.Diagram<"topdown", [
      Flowchart.Node<A, "diamond">,
      Flowchart.Node<B, "rectangle", "Custom">,
      Flowchart.Node<C, "rectangle", false>,
    ]>;
  `);
  assert.deepEqual(lines(code).slice(1), [
    `A{"A<br/>id: string"}`, // shape set, label still expands
    `B["Custom"]`, // explicit label suppresses expansion
    `C`, // false → bare name, no brackets for a rectangle
  ]);
});

test("edges carry their style and optional label", () => {
  const code = render(`${NODES}export type X = Flowchart.Diagram<"topdown", [
    Flowchart.Connect<A, B>,
    Flowchart.Connect<B, C, "Yes">,
    Flowchart.Connect<A, C, never, "dotted">,
    Flowchart.Connect<B, A, "maybe", "thick">,
  ]>;`);
  assert.deepEqual(lines(code).slice(1), [
    "A --> B",
    "B -->|Yes| C",
    "A -.-> C",
    "B ==>|maybe| A",
  ]);
});

test("a node declares its label once, then is referenced by id", () => {
  const code = render(`
    type A = { id: string };
    type B = {};
    export type X = Flowchart.Diagram<"topdown", [
      Flowchart.Connect<A, B>,
      Flowchart.Connect<A, B>,
    ]>;
  `);
  assert.deepEqual(lines(code).slice(1), [`A["A<br/>id: string"] --> B`, "A --> B"]);
});

test("subgraphs nest their members and close with end", () => {
  const code = render(`${NODES}export type X = Flowchart.Diagram<"topdown", [
    Flowchart.Subgraph<"Tier", [A, Flowchart.Connect<B, C>]>,
  ]>;`);
  assert.deepEqual(lines(code), [
    "flowchart TD",
    `subgraph "Tier"`,
    "A",
    "B --> C",
    "end",
  ]);
});

test("styles and style classes render their Mermaid directives", () => {
  const code = render(`${NODES}export type X = Flowchart.Diagram<"topdown", [
    Flowchart.Connect<A, B>,
    Flowchart.Style<A, "fill:#f9f">,
    Flowchart.DefineClass<"warn", "stroke-width:2px">,
    Flowchart.ApplyClass<[A, B], "warn">,
  ]>;`);
  assert.deepEqual(lines(code).slice(1), [
    "A --> B",
    "style A fill:#f9f",
    "classDef warn stroke-width:2px",
    "class A,B warn",
  ]);
});

test("labels escape quotes that would otherwise close the bracket", () => {
  const code = render(`
    type A = {};
    export type X = Flowchart.Diagram<"topdown", [Flowchart.Node<A, "rounded", 'say "hi"'>]>;
  `);
  assert.match(code, /A\("say #quot;hi#quot;"\)/);
});

test("an unknown direction falls back to top-down rather than failing", () => {
  assert.match(
    render(`${NODES}export type X = Flowchart.Diagram<"sideways", A>;`),
    /^flowchart TD/,
  );
});

test("a user type sharing a statement name renders as a node, not a statement", () => {
  // Only `Flowchart.Node<…>` is a statement; a bare `Node` is one of the user's
  // own types, and must reach the output as a node rather than be misdispatched.
  for (const name of ["Connect", "Node", "Subgraph", "Style", "DefineClass", "ApplyClass"]) {
    const code = render(`
      type ${name} = { tag: string };
      export type X = Flowchart.Diagram<"topdown", ${name}>;
    `);
    assert.equal(
      code,
      `flowchart TD\n    ${name}["${name}<br/>tag: string"]`,
      `bare user type ${name}`,
    );
  }
});

test("a colliding name nested in a real subgraph also renders as a node", () => {
  const code = render(`
    type Node = { tag: string };
    export type X = Flowchart.Diagram<"topdown", [Flowchart.Subgraph<"S", [Node]>]>;
  `);
  assert.deepEqual(lines(code), [
    "flowchart TD",
    `subgraph "S"`,
    `Node["Node<br/>tag: string"]`,
    "end",
  ]);
});

test("a real statement still works beside a user type of the same name", () => {
  const code = render(`
    type Connect = { id: string };
    type B = {};
    export type X = Flowchart.Diagram<"topdown", [Flowchart.Connect<Connect, B>]>;
  `);
  assert.equal(code, `flowchart TD\n    Connect["Connect<br/>id: string"] --> B`);
});
