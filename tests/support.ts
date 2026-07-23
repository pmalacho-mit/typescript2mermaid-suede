/**
 * Shared helpers. Not a test file — `*.test.ts` is what the runner picks up.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import type { TestContext } from "node:test";
import { Project, type TypeNode } from "ts-morph";
import { renderFrom } from "../release/render.js";

export const repoRoot = fileURLToPath(new URL("..", import.meta.url));

/**
 * Absolute path to the real library entry, forward-slashed so it is a valid
 * import specifier on any platform.
 *
 * Fixtures import from here rather than a bare package name because the DSL
 * matches constructs by *identity* — a reference only counts as ours when the
 * checker resolves it into this source, so snippets and fixtures must import the
 * real thing. An absolute path resolves from `code()`'s virtual file (rooted in
 * `release/`) and from a temp-dir fixture alike.
 */
export const LIB = join(repoRoot, "release", "index.js").replace(/\\/g, "/");

/** A resolvable import of every family, for a fixture or snippet. */
export const imports = (...names: string[]): string =>
  `import type { ${names.join(", ")} } from "${LIB}";\n`;

/** Prepended to every snippet so tests only write the declaration under test. */
const PRELUDE = imports(
  "Flowchart",
  "Sequence",
  "Class",
  "State",
  "Entity",
  "Journey",
  "Pie",
  "Gantt",
  "Render",
);

/** Every diagram declared in a snippet, keyed by alias name. */
export function renderAll(source: string): Record<string, string> {
  return Object.fromEntries(
    renderFrom.code(PRELUDE + source).map((d) => [d.name, d.code]),
  );
}

/** The one diagram declared in a snippet. Fails loudly if there isn't exactly one. */
export function render(source: string): string {
  const diagrams = renderFrom.code(PRELUDE + source);
  if (diagrams.length !== 1)
    throw new Error(
      `expected exactly 1 diagram, got ${diagrams.length}: ${diagrams.map((d) => d.name).join(", ")}`,
    );
  return diagrams[0]!.code;
}

/** Rendered lines with indentation stripped, for order-and-content assertions. */
export const lines = (code: string): string[] =>
  code.split("\n").map((line) => line.trim());

/** The type node of a named alias, for unit-testing helpers that take one. */
export function typeNode(source: string, alias: string): TypeNode {
  const file = new Project({
    compilerOptions: { strict: true },
    useInMemoryFileSystem: true,
  }).createSourceFile("input.ts", PRELUDE + source);
  return file.getTypeAliasOrThrow(alias).getTypeNodeOrThrow();
}

/** A throwaway directory of files, removed when the test finishes. */
export function workspace(
  t: TestContext,
  files: Record<string, string>,
): string {
  const dir = mkdtempSync(join(tmpdir(), "t2m-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return dir;
}

/** Run the real CLI in a subprocess — the only honest way to test its behaviour. */
export function runCli(args: string[], cwd = repoRoot) {
  const { status, stdout, stderr } = spawnSync(
    process.execPath,
    ["--import=tsx", join(repoRoot, "release/cli.ts"), ...args],
    { cwd, encoding: "utf8" },
  );
  return { status, stdout, stderr, output: stdout + stderr };
}

/** A source file declaring one flowchart, for fixtures that only need a name. */
export const diagramSource = (name: string, node = "Box") =>
  imports("Flowchart") +
  `type ${node} = { tag: "${node}" };\n` +
  `export type ${name} = Flowchart.Diagram<"topdown", ${node}>;\n`;
