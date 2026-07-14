/**
 * Bundles the extension into a single self-contained dist/extension.js.
 *
 * The typescript2mermaid library ships as raw TypeScript source in the parent folder
 * (vendored via git-subrepo), so there is no parent package to build: esbuild
 * compiles and inlines it directly, along with ts-morph and everything else.
 * Only the `vscode` module stays external (provided by the editor at runtime).
 */
import { build } from "esbuild";
import { accessSync, chmodSync, constants, cpSync, existsSync, mkdirSync } from "node:fs";
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
const mermaidAsset = path.join(root, "media", "mermaid.min.js");
cpSync(
  path.join(root, "node_modules", "mermaid", "dist", "mermaid.min.js"),
  mermaidAsset,
);
// cpSync carries the source mode across, and some mounts (e.g. the Docker
// Desktop `fakeowner` bind used by the devcontainer) hand back a mode with no
// read bit. vsce stores whatever mode it finds directly in the .vsix, so an
// unreadable asset here becomes an unreadable asset on every consumer machine
// whose filesystem actually enforces permissions — the webview's <script> then
// 404s and the preview silently degrades to raw text. Pin the mode, then prove
// the file is readable before we let the build pass.
chmodSync(mermaidAsset, 0o644);
accessSync(mermaidAsset, constants.R_OK);

console.log("bundled dist/extension.js and copied media/mermaid.min.js");
