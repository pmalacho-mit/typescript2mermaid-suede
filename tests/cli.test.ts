/**
 * The CLI is tested through its real entry point: argument handling, file
 * writes and exit codes are its contract, and none of them survive being
 * unit-tested around.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runCli, workspace, diagramSource } from "./support.js";

const marker = (name: string) => `# Doc\n\n<!-- diagram: ${name} -->\n`;
const read = (dir: string, file: string) => readFileSync(join(dir, file), "utf8");

test("with no destination, diagrams print to stdout", (t) => {
  const dir = workspace(t, { "d.ts": diagramSource("Overview") });
  const { status, stdout } = runCli([join(dir, "d.ts")]);

  assert.equal(status, 0);
  assert.match(stdout, /^### Overview\n\n```mermaid\nflowchart TD/);
});

test("--out writes a report and reports it unchanged on a second run", (t) => {
  const dir = workspace(t, { "d.ts": diagramSource("Overview") });
  const args = [join(dir, "d.ts"), "--out", join(dir, "report.md")];

  assert.equal(runCli(args).status, 0);
  assert.match(read(dir, "report.md"), /### Overview/);

  const again = runCli(args);
  assert.equal(again.status, 0);
  assert.match(again.stderr, /up to date/);
});

test("--embed fills a marker, closes it, and is idempotent", (t) => {
  const dir = workspace(t, {
    "d.ts": diagramSource("Overview"),
    "doc.md": marker("Overview"),
  });
  const args = [join(dir, "d.ts"), "--embed", join(dir, "doc.md")];

  assert.equal(runCli(args).status, 0);
  const first = read(dir, "doc.md");
  assert.match(first, /<!-- diagram: Overview -->\n```mermaid\nflowchart TD/);
  assert.match(first, /```\n<!-- \/diagram -->/);
  assert.match(first, /^# Doc/); // prose above the marker survives

  assert.equal(runCli(args).status, 0);
  assert.equal(read(dir, "doc.md"), first);
});

test("--check writes nothing and fails only when output is stale", (t) => {
  const dir = workspace(t, {
    "d.ts": diagramSource("Overview"),
    "doc.md": marker("Overview"),
  });
  const args = [join(dir, "d.ts"), "--embed", join(dir, "doc.md")];

  const stale = runCli([...args, "--check"]);
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /is out of date/);
  assert.equal(read(dir, "doc.md"), marker("Overview")); // untouched

  runCli(args);
  assert.equal(runCli([...args, "--check"]).status, 0);
});

test("a marker naming nothing is reported and left alone", (t) => {
  const dir = workspace(t, {
    "d.ts": diagramSource("Overview"),
    "doc.md": marker("Missing"),
  });
  const { status, stderr } = runCli([
    join(dir, "d.ts"),
    "--embed",
    join(dir, "doc.md"),
  ]);

  assert.equal(status, 1);
  assert.match(stderr, /no diagram named "Missing"/);
  // A rename must fail the run, never silently delete documentation.
  assert.equal(read(dir, "doc.md"), marker("Missing"));
});

test("with no sources, a diagram.ts beside each --embed target is used", (t) => {
  const dir = workspace(t, {
    "docs/diagram.ts": diagramSource("Overview"),
    "docs/api.md": marker("Overview"),
  });
  const { status, stderr } = runCli(["--embed", join(dir, "docs/api.md")]);

  assert.equal(status, 0);
  assert.match(stderr, /using .*docs\/diagram\.ts/);
  assert.match(read(dir, "docs/api.md"), /flowchart TD/);
});

test("with no sources and no diagram.ts, the run fails with what it looked for", (t) => {
  const dir = workspace(t, { "docs/api.md": marker("Overview") });
  const { status, stderr } = runCli(["--embed", join(dir, "docs/api.md")]);

  assert.equal(status, 1);
  assert.match(stderr, /no diagram\.ts beside/);
});

test("a colliding name resolves to the source nearest the document", (t) => {
  const dir = workspace(t, {
    "a/diagram.ts": diagramSource("Diagram", "Alpha"),
    "a/README.md": marker("Diagram"),
    "b/diagram.ts": diagramSource("Diagram", "Beta"),
    "b/README.md": marker("Diagram"),
  });
  const { status } = runCli([
    "--embed",
    join(dir, "a/README.md"),
    "--embed",
    join(dir, "b/README.md"),
  ]);

  assert.equal(status, 0);
  assert.match(read(dir, "a/README.md"), /Alpha/);
  assert.match(read(dir, "b/README.md"), /Beta/);
});

test("equally distant sources stay ambiguous rather than being guessed", (t) => {
  const dir = workspace(t, {
    "x/diagram.ts": diagramSource("Diagram", "Alpha"),
    "y/diagram.ts": diagramSource("Diagram", "Beta"),
    "README.md": marker("Diagram"),
  });
  const { status, stderr } = runCli([
    join(dir, "x/diagram.ts"),
    join(dir, "y/diagram.ts"),
    "--embed",
    join(dir, "README.md"),
  ]);

  assert.equal(status, 1);
  assert.match(stderr, /is ambiguous/);
  assert.match(stderr, /add from="…"/);
});

test('from="…" overrides proximity', (t) => {
  const dir = workspace(t, {
    "a/diagram.ts": diagramSource("Diagram", "Alpha"),
    "a/README.md": `<!-- diagram: Diagram from="b/diagram.ts" -->\n`,
    "b/diagram.ts": diagramSource("Diagram", "Beta"),
  });
  const { status } = runCli([
    join(dir, "a/diagram.ts"),
    join(dir, "b/diagram.ts"),
    "--embed",
    join(dir, "a/README.md"),
  ]);

  assert.equal(status, 0);
  assert.match(read(dir, "a/README.md"), /Beta/);
});

test("bad invocations fail cleanly instead of crashing", (t) => {
  const dir = workspace(t, { "doc.md": marker("Overview") });

  const noArgs = runCli([]);
  assert.equal(noArgs.status, 1);
  assert.match(noArgs.stderr, /no source files given/);
  assert.match(noArgs.stderr, /Usage:/);

  // A typo'd path must not surface as a raw ts-morph FileNotFoundError.
  const typo = runCli([join(dir, "nope.ts")]);
  assert.equal(typo.status, 1);
  assert.match(typo.stderr, /no such file/);
  assert.doesNotMatch(typo.stderr, /FileNotFoundError/);
});

test("--help lists every flag and exits successfully", () => {
  const { status, stdout } = runCli(["--help"]);

  assert.equal(status, 0);
  for (const flag of ["--project", "--embed", "--out", "--check", "--marker"])
    assert.match(stdout, new RegExp(flag));
});
