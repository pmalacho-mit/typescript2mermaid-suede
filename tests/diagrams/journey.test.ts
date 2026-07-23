import { test } from "node:test";
import assert from "node:assert/strict";
import { render, lines } from "../support.js";

const ACTORS = `type User = {}; type Admin = {};\n`;

test("title, sections and tasks render in declaration order", () => {
  const code = render(`${ACTORS}export type X = Journey.Diagram<"Checkout", [
    Journey.Section<"Browse", [
      Journey.Task<"Visit homepage", 5, [User]>,
      Journey.Task<"Search", 3, [User]>,
    ]>,
    Journey.Section<"Pay", [
      Journey.Task<"Enter card", 2, [User, Admin]>,
    ]>,
  ]>;`);
  assert.deepEqual(lines(code), [
    "journey",
    "title Checkout",
    "section Browse",
    "Visit homepage: 5: User",
    "Search: 3: User",
    "section Pay",
    "Enter card: 2: User, Admin",
  ]);
});

test("tasks indent deeper than their section, as Mermaid journeys expect", () => {
  const code = render(
    `${ACTORS}export type X = Journey.Diagram<"T", [Journey.Section<"S", [Journey.Task<"t", 3, [User]>]>]>;`,
  );
  assert.match(code, /\n {4}section S\n {6}t: 3: User$/);
});

test("actors may be string literals, for names types cannot express", () => {
  assert.match(
    render(
      `${ACTORS}export type X = Journey.Diagram<"T", [Journey.Section<"S", [Journey.Task<"t", 4, ["Support Agent", User]>]>]>;`,
    ),
    /t: 4: Support Agent, User$/,
  );
});

test("a body that is not a Section fails, and so does a non-Task", () => {
  assert.throws(
    () => render(`export type X = Journey.Diagram<"T", [{}]>;`),
    /Journey body must contain Section<> entries/,
  );
  assert.throws(
    () => render(`export type X = Journey.Diagram<"T", [Journey.Section<"S", [{}]>]>;`),
    /Section body must contain Task<> entries/,
  );
});
