import { test } from "node:test";
import assert from "node:assert/strict";
import { escape, safeMembers } from "../release/common.js";
import { typeNode } from "./support.js";

test("escape neutralises quotes that would close a Mermaid label", () => {
  assert.equal(escape(`a "quoted" label`), "a #quot;quoted#quot; label");
  assert.equal(escape("nothing to do"), "nothing to do");
});

test("safeMembers reads properties with their declared type text", () => {
  const members = safeMembers(
    typeNode(`type T = { id: string; count: number };`, "T"),
  );
  assert.deepEqual(
    members.map((m) => [m.name, m.typeText]),
    [
      ["id", "string"],
      ["count", "number"],
    ],
  );
});

test("safeMembers decodes visibility markers, defaulting to public", () => {
  const members = safeMembers(
    typeNode(
      `type T = {
         open: string;
         hidden: Class.Private<string>;
         guarded: Class.Protected<number>;
         internal: Class.Internal<boolean>;
       };`,
      "T",
    ),
  );
  assert.deepEqual(
    members.map((m) => [m.name, m.visibility]),
    [
      ["open", "+"],
      ["hidden", "-"],
      ["guarded", "#"],
      ["internal", "~"],
    ],
  );
  // The marker is an identity type, so the checker still sees the real type.
  assert.equal(members[1]!.typeText, "string");
});

test("safeMembers collects key markers, including stacked ones", () => {
  const members = safeMembers(
    typeNode(
      `type T = {
         id: Entity.Key.Primary<Entity.Integer>;
         owner: Entity.Key.Foreign<Entity.Key.Unique<Entity.Integer>>;
         plain: Entity.Text;
       };`,
      "T",
    ),
  );
  assert.deepEqual(
    members.map((m) => [m.name, m.keys]),
    [
      ["id", ["PK"]],
      ["owner", ["FK", "UK"]],
      ["plain", []],
    ],
  );
});

test("safeMembers treats method signatures and function properties alike", () => {
  const members = safeMembers(
    typeNode(
      `type T = {
         save(name: string): boolean;
         load: (id: number) => void;
         value: string;
       };`,
      "T",
    ),
  );
  assert.deepEqual(
    members.map((m) => [m.name, m.isMethod, m.params, m.returns]),
    [
      ["save", true, "name: string", "boolean"],
      // `void` returns render as nothing rather than the literal word.
      ["load", true, "id: number", ""],
      ["value", false, "", ""],
    ],
  );
});

test("safeMembers flattens intersections — resolution is the point", () => {
  const members = safeMembers(
    typeNode(
      `type A = { id: string };
       type B = { name: string };
       type T = A & B;`,
      "T",
    ),
  );
  assert.deepEqual(members.map((m) => m.name), ["id", "name"]);
});

test("safeMembers yields nothing for an empty object type", () => {
  // Renderers branch on this to emit a bare node instead of an expanded label.
  assert.deepEqual(safeMembers(typeNode(`type T = {};`, "T")), []);
});
