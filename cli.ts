#!/usr/bin/env node
/**
 * typescript2mermaid CLI
 *
 *   ./cli.sh <files...> [--out report.md] [--embed doc.md] [--check]
 *
 * `cli.sh` is a wrapper over `npx tsx cli.ts`. Runs from source; `node` cannot,
 * since the `.js` import specifiers here are not remapped to `.ts` by its type
 * stripping. Compile with `tsc` and run the emitted `dist/cli.js` if plain
 * `node` is required.
 *
 * Scans TypeScript files for `<Family>.Diagram<...>` type aliases and either
 * prints them as GitHub-compatible ```mermaid blocks, writes a standalone
 * report, or embeds each one where a Markdown file asks for it:
 *
 *   <!-- diagram: DeploymentPipeline -->
 *   <!-- /diagram -->
 *
 * The closing marker is written on the first run; every run after that replaces
 * what sits between the pair, so the command is idempotent.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { cli } from "./typescript-cli-suede/index.js";
import { embed, type EmbedTarget } from "./typescript-dsl-suede/markdown.js";
import { renderFrom } from "./render.js";

export const defaults = {
  marker: "diagram",
  language: "mermaid",
} as const;

type Diagram = ReturnType<typeof renderFrom.files>[number];

/**
 * `type DeploymentPipeline = ...` → "Deployment Pipeline". Only used by the
 * standalone report; embedded diagrams sit under the author's own headings.
 */
const displayName = (name: string): string =>
  name.replace(/^_+/, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2") || "Diagram";

const fence = (code: string) => `\`\`\`${defaults.language}\n${code}\n\`\`\``;

const report = (diagrams: Diagram[]) =>
  diagrams
    .map((d) => `### ${displayName(d.name)}\n\n${fence(d.code)}`)
    .join("\n\n") + "\n";

const shorten = (path: string) => relative(process.cwd(), path) || path;

/**
 * Marker name → diagram. Matches the alias name (`Deploy`) or its
 * namespace-qualified id (`Docs.Deploy`); `from=` narrows by source path when
 * two files declare the same name.
 */
const resolver =
  (diagrams: Diagram[], problems: string[]) =>
  (target: EmbedTarget): string | undefined => {
    const { from } = target.attrs;
    const matches = diagrams.filter(
      (d) =>
        (d.name === target.name || d.name.endsWith(`.${target.name}`)) &&
        (from === undefined || d.file.includes(from)),
    );

    if (matches.length === 1) return matches[0]!.code;
    problems.push(
      matches.length === 0
        ? `no diagram named "${target.name}"${from ? ` from "${from}"` : ""}`
        : `"${target.name}" is ambiguous — declared in ${matches
            .map((m) => shorten(m.file))
            .join(", ")}; add from="…" to the marker`,
    );
    return undefined;
  };

cli.onEntry(import.meta.url, () => {
  const args = cli(
    "Render TypeScript type-level diagram declarations to Mermaid.",
    cli.flag(
      ["project", "p"],
      "tsconfig.json to resolve the source files against.",
    ),
    cli.flags(
      ["embed", "e"],
      "Markdown file to populate in place. Repeatable.",
    ),
    cli.flag(["out", "o"], "Write a standalone Markdown report to this path."),
    cli.flag(
      ["check", "c"],
      "Do not write anything; exit non-zero if any output is out of date.",
      false,
    ),
    cli.flag(
      ["marker", "m"],
      "Marker keyword to look for in Markdown.",
      defaults.marker,
    ),
  );

  const { project, embed: markdowns, out, check, marker } = args;
  const sources = [...args];

  if (sources.length === 0) {
    console.error("typescript2mermaid: no source files given.\n");
    console.error(args.help());
    process.exit(1);
  }

  // ts-morph throws a raw FileNotFoundError otherwise, which reads like a crash
  // rather than a typo.
  const missing = sources.filter((path) => !existsSync(path));
  if (missing.length > 0) {
    for (const path of missing)
      console.error(`typescript2mermaid: no such file: ${path}`);
    process.exit(1);
  }

  const diagrams = renderFrom.files(sources, project);
  if (diagrams.length === 0) {
    console.error("typescript2mermaid: no `Diagram<...>` type aliases found.");
    process.exit(1);
  }

  const problems: string[] = [];
  const stale: string[] = [];

  for (const path of markdowns) {
    if (!existsSync(path)) {
      problems.push(`${shorten(path)}: no such file`);
      continue;
    }

    const found: string[] = [];
    const result = embed(
      readFileSync(path, "utf8"),
      resolver(diagrams, found),
      { marker, language: defaults.language },
    );

    for (const problem of found) problems.push(`${shorten(path)}: ${problem}`);

    if (result.embedded.length === 0 && result.unresolved.length === 0)
      console.error(
        `typescript2mermaid: ${shorten(path)} has no <!-- ${marker}: … --> markers.`,
      );
    // Unresolved markers are reported below; calling the file "up to date"
    // while errors follow reads as a contradiction.
    else if (!result.changed && result.unresolved.length === 0)
      console.error(
        `typescript2mermaid: ${shorten(path)} up to date (${result.embedded.length} diagram(s)).`,
      );
    else if (result.changed && check) stale.push(path);
    else if (result.changed) {
      writeFileSync(path, result.text);
      console.error(
        `typescript2mermaid: embedded ${result.embedded.length} diagram(s) into ${shorten(path)}`,
      );
    }
  }

  if (out) {
    const text = report(diagrams);
    const current = existsSync(out) ? readFileSync(out, "utf8") : undefined;
    if (current === text)
      console.error(`typescript2mermaid: ${shorten(out)} up to date.`);
    else if (check) stale.push(out);
    else {
      writeFileSync(out, text);
      console.error(
        `typescript2mermaid: wrote ${diagrams.length} diagram(s) to ${shorten(out)}`,
      );
    }
  }

  // No destination at all — the original behaviour, useful for piping.
  if (markdowns.length === 0 && !out) console.log(report(diagrams).trimEnd());

  for (const problem of problems)
    console.error(`typescript2mermaid: ${problem}`);
  for (const path of stale)
    console.error(`typescript2mermaid: ${shorten(path)} is out of date.`);

  if (problems.length > 0 || stale.length > 0) process.exit(1);
});
