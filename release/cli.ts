#!/usr/bin/env node
/**
 * typescript2mermaid CLI
 *
 *   typescript2mermaid <files...> [-o output.md] [--project tsconfig.json]
 *
 * Scans the given TypeScript files for `type X = Diagram<...>` aliases and
 * emits GitHub-compatible ```mermaid fenced blocks — to stdout by default,
 * or to a markdown file with -o.
 */
import { writeFileSync } from "node:fs";
import { generateFrom } from "./generate.js";

function main(argv: string[]): void {
  const files: string[] = [];
  let out: string | undefined;
  let project: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-o" || arg === "--out") out = argv[++i];
    else if (arg === "--project" || arg === "-p") project = argv[++i];
    else if (arg === "-h" || arg === "--help") return usage();
    else files.push(arg);
  }
  if (files.length === 0) return usage(1);

  const diagrams = generateFrom.files(files, project);
  if (diagrams.length === 0) {
    console.error("typescript2mermaid: no `Diagram<...>` type aliases found.");
    process.exitCode = 1;
    return;
  }

  const md = diagrams
    .map(
      (d) => `### ${displayName(d.name)}\n\n\`\`\`mermaid\n${d.code}\n\`\`\``,
    )
    .join("\n\n");

  if (out) {
    writeFileSync(out, md + "\n");
    console.error(
      `typescript2mermaid: wrote ${diagrams.length} diagram(s) to ${out}`,
    );
  } else {
    console.log(md);
  }
}

function displayName(alias: string): string {
  // `type DeploymentPipeline = ...` → "Deployment Pipeline"
  return (
    alias.replace(/^_+/, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2") || "Diagram"
  );
}

function usage(code = 0): void {
  console.error(
    "usage: typescript2mermaid <files...> [-o output.md] [--project tsconfig.json]",
  );
  process.exitCode = code;
}

main(process.argv.slice(2));
