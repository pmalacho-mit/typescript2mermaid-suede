import { test } from "node:test";
import assert from "node:assert/strict";
import { render, lines } from "../support.js";

const gantt = (body: string) =>
  render(`export type X = Gantt.Diagram<"Roadmap", "YYYY-MM-DD", [${body}]>;`);

test("the header carries the title and date format", () => {
  assert.deepEqual(
    lines(gantt(`Gantt.Section<"Phase 1", []>`)),
    ["gantt", "title Roadmap", "dateFormat  YYYY-MM-DD", "section Phase 1"],
  );
});

test("a task renders id, begin and finish after the colon", () => {
  assert.equal(
    lines(
      gantt(
        `Gantt.Section<"P", [Gantt.Task<"Analysis", "req", "2024-01-01", "2024-01-15">]>`,
      ),
    )[4],
    "Analysis :req, 2024-01-01, 2024-01-15",
  );
});

test("a status is prepended to the task metadata when given", () => {
  const task = (status: string) =>
    lines(
      gantt(
        `Gantt.Section<"P", [Gantt.Task<"T", "id", "2024-01-01", "5d", "${status}">]>`,
      ),
    )[4];
  assert.equal(task("done"), "T :done, id, 2024-01-01, 5d");
  assert.equal(task("active"), "T :active, id, 2024-01-01, 5d");
  assert.equal(task("crit"), "T :crit, id, 2024-01-01, 5d");
});

test("After<> becomes a Mermaid dependency instead of a date", () => {
  assert.equal(
    lines(
      gantt(
        `Gantt.Section<"P", [Gantt.Task<"Design", "design", Gantt.After<"req">, "10d", "done">]>`,
      ),
    )[4],
    "Design :done, design, after req, 10d",
  );
});

test("a body that is not a Section fails, and so does a non-Task", () => {
  assert.throws(
    () => gantt(`{}`),
    /Gantt body must contain Section<> entries/,
  );
  assert.throws(
    () => gantt(`Gantt.Section<"P", [{}]>`),
    /Section body must contain Gantt.Task<> entries/,
  );
});
