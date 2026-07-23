import { test } from "node:test";
import assert from "node:assert/strict";
import { render, lines } from "../support.js";

const ACTORS = `type Alice = {}; type Bob = {};\n`;
const seq = (body: string) =>
  render(`${ACTORS}export type X = Sequence.Diagram<[${body}]>;`);

test("participants and actors declare lifelines, optionally aliased", () => {
  assert.deepEqual(
    lines(
      seq(`
        Sequence.Participant<Alice>,
        Sequence.Actor<Bob, "Bob the user">,
      `),
    ).slice(1),
    ["participant Alice", "actor Bob as Bob the user"],
  );
});

test("each message kind uses its own arrow", () => {
  assert.deepEqual(
    lines(
      seq(`
        Sequence.Message<Alice, Bob, "request">,
        Sequence.Reply<Bob, Alice, "response">,
        Sequence.Lost<Alice, Bob, "dropped">,
        Sequence.Async<Alice, Bob, "fire">,
      `),
    ).slice(1),
    [
      "Alice->>Bob: request",
      "Bob-->>Alice: response",
      "Alice-xBob: dropped",
      "Alice-)Bob: fire",
    ],
  );
});

test("activation suffixes open and close the box", () => {
  assert.deepEqual(
    lines(
      seq(`
        Sequence.Message<Alice, Bob, "start", "activate">,
        Sequence.Reply<Bob, Alice, "done", "deactivate">,
      `),
    ).slice(1),
    ["Alice->>+Bob: start", "Bob-->>-Alice: done"],
  );
});

test("notes render over, right of, and left of their targets", () => {
  assert.deepEqual(
    lines(
      seq(`
        Sequence.NoteOver<[Alice, Bob], "shared">,
        Sequence.NoteRight<Alice, "beside">,
        Sequence.NoteLeft<Bob, "other side">,
      `),
    ).slice(1),
    [
      "Note over Alice,Bob: shared",
      "Note right of Alice: beside",
      "Note left of Bob: other side",
    ],
  );
});

test("loop and opt wrap an indented body between keyword and end", () => {
  const code = seq(`
    Sequence.Loop<"every minute", [Sequence.Message<Alice, Bob, "poll">]>,
    Sequence.Optional<"if enabled", [Sequence.Message<Bob, Alice, "extra">]>,
  `);
  assert.deepEqual(lines(code).slice(1), [
    "loop every minute",
    "Alice->>Bob: poll",
    "end",
    "opt if enabled",
    "Bob->>Alice: extra",
    "end",
  ]);
  // The body really is indented one level deeper than its keyword.
  assert.match(code, /\n {4}loop every minute\n {8}Alice->>Bob: poll\n {4}end/);
});

test("alternative renders its else branch when one is given", () => {
  assert.deepEqual(
    lines(
      seq(`
        Sequence.Alternative<
          "is valid",
          [Sequence.Message<Alice, Bob, "ok">],
          "otherwise",
          [Sequence.Message<Alice, Bob, "nope">]
        >,
      `),
    ).slice(1),
    ["alt is valid", "Alice->>Bob: ok", "else otherwise", "Alice->>Bob: nope", "end"],
  );
});
