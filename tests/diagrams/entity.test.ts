import { test } from "node:test";
import assert from "node:assert/strict";
import { render, lines } from "../support.js";

const ENTITIES = `type USER = {}; type ORDER = {};\n`;

test("each cardinality maps to its crow's-foot connector", () => {
  const connector = (card: string) =>
    lines(
      render(
        `${ENTITIES}export type X = Entity.Diagram<[Entity.Relation<USER, ORDER, "${card}", "has">]>;`,
      ),
    )[1];
  assert.equal(connector("one-to-one"), "USER ||--|| ORDER : has");
  assert.equal(connector("one-to-many"), "USER ||--|{ ORDER : has");
  assert.equal(connector("one-to-zero-or-many"), "USER ||--o{ ORDER : has");
  assert.equal(connector("zero-or-one-to-many"), "USER |o--|{ ORDER : has");
  assert.equal(connector("many-to-one"), "USER }|--|| ORDER : has");
  assert.equal(connector("many-to-many"), "USER }|--|{ ORDER : has");
});

test("relation labels containing whitespace are quoted, as Mermaid requires", () => {
  const label = (text: string) =>
    lines(
      render(
        `${ENTITIES}export type X = Entity.Diagram<[Entity.Relation<USER, ORDER, "one-to-many", "${text}">]>;`,
      ),
    )[1];
  assert.match(label("places")!, /: places$/);
  assert.match(label("really places")!, /: "really places"$/);
});

test("attributes carry conventional ER types and key markers", () => {
  const code = render(`
    type USER = {
      user_id: Entity.Key.Primary<Entity.Integer>;
      email: Entity.Key.Unique<Entity.Text>;
      balance: Entity.Decimal;
      active: Entity.Boolean;
      joined: Entity.DateTime;
      note: string;
      count: number;
    };
    export type X = Entity.Diagram<[Entity.Include<USER>]>;
  `);
  assert.deepEqual(lines(code), [
    "erDiagram",
    "USER {",
    "int user_id PK",
    "text email UK",
    "decimal balance",
    "boolean active",
    "datetime joined",
    "string note",
    "int count",
    "}",
  ]);
});

test("an entity with no attributes contributes no block", () => {
  // The separator blank line is emitted whenever there are relations *and*
  // registered entities, even when every entity turns out to render nothing —
  // so a trailing empty line is expected here.
  assert.deepEqual(
    lines(
      render(
        `${ENTITIES}export type X = Entity.Diagram<[Entity.Relation<USER, ORDER, "one-to-many", "has">]>;`,
      ),
    ),
    ["erDiagram", "USER ||--|{ ORDER : has", ""],
  );
});

test("an unknown statement fails with the offending text", () => {
  assert.throws(
    () => render(`${ENTITIES}export type X = Entity.Diagram<[Entity.Nonsense<USER>]>;`),
    /unknown entity-relationship statement/,
  );
});
