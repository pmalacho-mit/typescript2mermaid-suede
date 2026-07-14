/**
 * Bundles the extension into a single self-contained dist/extension.js.
 *
 * The typescript2mermaid library ships as raw TypeScript source in the parent folder
 * (vendored via git-subrepo), so there is no parent package to build: esbuild
 * compiles and inlines it directly, along with ts-morph and everything else.
 * Only the `vscode` module stays external (provided by the editor at runtime).
 */
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

// Library entry: flattened vendored layout first, development repo layout second.
const libCandidates = [
  path.join(root, "..", "index.ts"),
  path.join(root, "..", "src", "index.ts"),
];
const lib = libCandidates.find(existsSync);
if (!lib) {
  console.error(
    "typescript2mermaid library source not found next to vscode-extension/ — expected ../index.ts or ../src/index.ts",
  );
  process.exit(1);
}

await build({
  entryPoints: [path.join(root, "src", "extension.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  external: ["vscode"],
  alias: { "typescript2mermaid-lib": lib },
  // The vendored library sits *outside* this folder; Node-style resolution
  // walks upward from each importing file and would never find our
  // node_modules, so add it as an explicit fallback.
  nodePaths: [path.join(root, "node_modules")],
  outfile: path.join(root, "dist", "extension.js"),
  logLevel: "info",
});

// The preview webview loads Mermaid from a local asset (no network, and the
// packaged .vsix contains no node_modules).
mkdirSync(path.join(root, "media"), { recursive: true });
cpSync(
  path.join(root, "node_modules", "mermaid", "dist", "mermaid.min.js"),
  path.join(root, "media", "mermaid.min.js"),
);
console.log("bundled dist/extension.js and copied media/mermaid.min.js");
