/**
 * Identity matching: a reference counts as one of ours only when the checker
 * resolves it into this library's source — not merely because it is *spelled*
 * like our construct. These are the cases name+qualifier matching alone cannot
 * decide.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderFrom } from "../release/render.js";
import { LIB } from "./support.js";

test("a user's own `namespace Flowchart` is not our diagram", () => {
  // Same spelling as our DSL — `Flowchart.Diagram<...>` — but declared in user
  // space and never imported from us. Qualifier matching would accept it;
  // identity rejects it, so nothing is emitted.
  const found = renderFrom.code(`
    namespace Flowchart {
      export type Diagram<D, B> = { fake: [D, B] };
    }
    export type X = Flowchart.Diagram<"topdown", {}>;
  `);
  assert.deepEqual(found, []);
});

test("a user's shadowed statement inside a real diagram stays a node", () => {
  // Our real Flowchart.Diagram, but the body references a locally-declared
  // `Flowchart.Connect` — not ours. It must render as a node, not an edge.
  const [d] = renderFrom.code(`
    import type { Flowchart } from "${LIB}";
    namespace Fake { export type Connect<A, B> = { no: [A, B] }; }
    type A = {}; type B = {};
    export type X = Flowchart.Diagram<"topdown", [Fake.Connect<A, B>]>;
  `);
  // Fake.Connect resolves to user space → treated as a node, expanding its
  // resolved type like any other user type in node position.
  assert.equal(d!.code, `flowchart TD\n    Connect["Connect<br/>no: [A, B]"]`);
});

test("an unresolved import yields no diagrams — resolution is required", () => {
  // The accepted trade-off: without a resolvable import there is no way to prove
  // the type is ours, so we emit nothing rather than guess.
  const found = renderFrom.code(`
    import type { Flowchart } from "does-not-resolve";
    type A = {};
    export type X = Flowchart.Diagram<"topdown", A>;
  `);
  assert.deepEqual(found, []);
});

test("the same declaration renders once its import resolves", () => {
  const [d] = renderFrom.code(`
    import type { Flowchart } from "${LIB}";
    type A = {};
    export type X = Flowchart.Diagram<"topdown", A>;
  `);
  assert.equal(d!.code, "flowchart TD\n    A");
});
