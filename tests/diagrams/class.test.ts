import { test } from "node:test";
import assert from "node:assert/strict";
import { render, lines } from "../support.js";

const TYPES = `type Dog = {}; type Animal = {}; type Owner = {};\n`;
const cls = (body: string) =>
  render(`${TYPES}export type X = Class.Diagram<[${body}]>;`);

test("relationships render with their arrow, reversing where Mermaid expects it", () => {
  const code = cls(`
    Class.Extends<Dog, Animal>,
    Class.Composition<Owner, Dog>,
    Class.Aggregation<Owner, Animal>,
    Class.Association<Owner, Dog, "owns">,
    Class.Link<Dog, Animal>,
    Class.DependsOn<Dog, Owner>,
    Class.Realizes<Dog, Animal>,
    Class.Implements<Dog, Owner>,
  `);
  // Class declarations are emitted first; this test is about the arrows.
  assert.deepEqual(
    lines(code).filter((line) => !line.startsWith("class") && line !== ""),
    [
      // Extends swaps its operands so the arrow reads parent-first.
      "Animal <|-- Dog",
      "Owner *-- Dog",
      "Owner o-- Animal",
      "Owner --> Dog : owns",
      "Dog -- Animal",
      "Dog ..> Owner",
      "Dog ..|> Animal",
      "Dog --|> Owner",
    ],
  );
});

test("a referenced type expands into a full class body", () => {
  // No members → a bare `class` line.
  assert.equal(cls(`Class.Class<Dog>`), "classDiagram\n    class Dog");

  assert.deepEqual(
    lines(
      render(`
        type Dog = {
          name: string;
          age: Class.Private<number>;
          bark(times: number): boolean;
        };
        export type X = Class.Diagram<[Class.Class<Dog>]>;
      `),
    ),
    [
      "classDiagram",
      "class Dog {",
      "+string name",
      "-number age",
      "+bark(times: number) boolean",
      "}",
    ],
  );
});

test("classes are collected from relationships without being declared", () => {
  const code = render(`
    type Dog = { name: string };
    type Animal = {};
    export type X = Class.Diagram<[Class.Extends<Dog, Animal>]>;
  `);
  // Bodies come first, relationships after. Animal is registered before Dog
  // because `Extends` swaps its operands, and having no members it renders as
  // a bare class.
  assert.deepEqual(lines(code), [
    "classDiagram",
    "class Animal",
    "class Dog {",
    "+string name",
    "}",
    "Animal <|-- Dog",
  ]);
});

test("an unknown statement fails with the offending text", () => {
  assert.throws(
    () => cls(`Class.Nonsense<Dog, Animal>`),
    /unknown class-diagram statement/,
  );
});
