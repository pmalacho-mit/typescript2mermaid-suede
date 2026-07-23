import { test } from "node:test";
import assert from "node:assert/strict";
import { render, lines } from "../support.js";

const STATES = `type Idle = {}; type Busy = {}; type Done = {};\n`;
const state = (body: string) =>
  render(`${STATES}export type X = State.Diagram<[${body}]>;`);

test("Start and End become Mermaid's [*] pseudo-state", () => {
  assert.deepEqual(
    lines(
      state(`
        State.Transition<State.Start, Idle>,
        State.Transition<Done, State.End>,
      `),
    ).slice(1),
    ["[*] --> Idle", "Done --> [*]"],
  );
});

test("a transition label follows a colon, and is omitted when absent", () => {
  assert.deepEqual(
    lines(
      state(`
        State.Transition<Idle, Busy, "start">,
        State.Transition<Busy, Done>,
      `),
    ).slice(1),
    ["Idle --> Busy : start", "Busy --> Done"],
  );
});

test("composite states nest an indented machine in braces", () => {
  const code = state(`
    State.Composite<Busy, [
      State.Transition<State.Start, Idle>,
      State.Transition<Idle, Done>,
    ]>,
  `);
  assert.deepEqual(lines(code), [
    "stateDiagram-v2",
    "state Busy {",
    "[*] --> Idle",
    "Idle --> Done",
    "}",
  ]);
  assert.match(code, /\n {4}state Busy \{\n {8}\[\*\] --> Idle/);
});

test("notes render on the requested side across three lines", () => {
  assert.deepEqual(
    lines(state(`State.Note<Idle, "left", "waiting for input">`)).slice(1),
    ["note left of Idle", "waiting for input", "end note"],
  );
});

test("an unknown statement fails with the offending text", () => {
  assert.throws(
    () => state(`State.Nonsense<Idle>`),
    /unknown state-diagram statement/,
  );
});
