import { test } from "node:test";
import assert from "node:assert/strict";
import { render, lines } from "../support.js";

test("Slice entries render as quoted label/value pairs", () => {
  assert.deepEqual(
    lines(
      render(`export type X = Pie.Diagram<"Usage", [
        Pie.Slice<"CPU", 35>,
        Pie.Slice<"Memory", 25.5>,
      ]>;`),
    ),
    ["pie title Usage", `"CPU" : 35`, `"Memory" : 25.5`],
  );
});

test("an object type's numeric-literal properties become slices", () => {
  assert.deepEqual(
    lines(
      render(`
        type Usage = { CPU: 35; Memory: 25 };
        export type X = Pie.Diagram<"Usage", Usage>;
      `),
    ),
    ["pie title Usage", `"CPU" : 35`, `"Memory" : 25`],
  );
});

test("a user type named Slice is a valid object body, not a stray slice entry", () => {
  // `Slice` unqualified is one of the user's types; only `Pie.Slice<…>` is the
  // tuple-entry construct.
  assert.deepEqual(
    lines(
      render(`
        type Slice = { CPU: 35; Memory: 25 };
        export type X = Pie.Diagram<"Usage", Slice>;
      `),
    ),
    ["pie title Usage", `"CPU" : 35`, `"Memory" : 25`],
  );
});

test("a body that is neither slices nor numeric literals fails", () => {
  assert.throws(
    () =>
      render(`
        type NotNumbers = { CPU: string };
        export type X = Pie.Diagram<"Usage", NotNumbers>;
      `),
    /must be Slice<> entries or a type with numeric-literal properties/,
  );
});
