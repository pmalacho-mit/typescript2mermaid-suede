#!/usr/bin/env node
/**
 * One-shot local install of the typescript2mermaid VSCode extension.
 *
 *   node install.mjs        (or ./install.sh)
 *
 * Steps: npm install → bundle (esbuild) → typecheck → package (.vsix)
 * → install into whichever VSCode-family CLI is on PATH.
 * Safe to re-run any time the vendored library updates.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const shell = process.platform === "win32";
const VSIX = "typescript2mermaid.vsix";

function run(cmd, args, allowFail = false) {
  const result = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell });
  if (result.status !== 0 && !allowFail) {
    console.error(`\n✖ Failed: ${cmd} ${args.join(" ")}`);
    process.exit(result.status ?? 1);
  }
  return result.status === 0;
}

console.log("▸ Installing build dependencies...");
run("npm", ["install"]);

console.log(
  "\n▸ Bundling extension (library source is compiled in — no parent build needed)...",
);
run("npm", ["run", "build"]);

console.log("\n▸ Typechecking...");
run("npm", ["run", "typecheck"]);

console.log("\n▸ Packaging VSIX...");
run("npx", [
  "--yes",
  "@vscode/vsce",
  "package",
  "--no-dependencies",
  "-o",
  VSIX,
]);

const clis = shell
  ? ["code.cmd", "code-insiders.cmd", "codium.cmd", "cursor.cmd"]
  : ["code", "code-insiders", "codium", "cursor"];
const cli = clis.find(
  (c) => spawnSync(c, ["--version"], { shell, stdio: "ignore" }).status === 0,
);

if (!cli) {
  console.log(`\n✔ Built ${VSIX}, but no VSCode CLI was found on PATH.`);
  console.log(
    "  Finish manually: Command Palette → “Extensions: Install from VSIX...” →",
  );
  console.log(`  select ${path.join(root, VSIX)}`);
  process.exit(0);
}

console.log(`\n▸ Installing into ${cli}...`);
run(cli, ["--install-extension", path.join(root, VSIX), "--force"]);

console.log(
  "\n✔ Installed. In any open VSCode window run “Developer: Reload Window”,",
);
console.log("  then hover a `Render<...>` type alias in a TypeScript file.");
