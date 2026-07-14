import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";

// Resolved by build.mjs (esbuild alias) and tsconfig `paths` to the vendored
// library source next to this folder — compiled straight into the bundle.
import { GeneratorSession, type EmittedDiagram } from "typescript2mermaid-lib";

/* ------------------------------ logging ------------------------------ */

/**
 * "typescript2mermaid" in the Output panel.
 *
 * The webview is a separate context whose console is only reachable through the
 * webview developer tools, so failures in there are invisible from the editor.
 * Everything it does is mirrored here instead.
 */
const out = vscode.window.createOutputChannel("typescript2mermaid");

function log(message: string): void {
  const time = new Date().toISOString().slice(11, 23);
  out.appendLine(`[${time}] ${message}`);
}

/* ------------------------- session + caching ------------------------- */

const sessions = new Map<string, GeneratorSession>();
const cache = new Map<
  string,
  { version: number; diagrams: EmittedDiagram[] }
>();

function sessionFor(doc: vscode.TextDocument): GeneratorSession {
  const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
  const key = folder?.uri.fsPath ?? "<no-workspace>";
  let session = sessions.get(key);
  if (!session) {
    const tsconfig = folder
      ? path.join(folder.uri.fsPath, "tsconfig.json")
      : undefined;
    session = new GeneratorSession(
      tsconfig && fs.existsSync(tsconfig) ? tsconfig : undefined,
    );
    sessions.set(key, session);
  }
  return session;
}

async function diagramsFor(
  doc: vscode.TextDocument,
): Promise<EmittedDiagram[]> {
  const hit = cache.get(doc.uri.fsPath);
  if (hit && hit.version === doc.version) return hit.diagrams;
  const session = sessionFor(doc);
  session.updateFile(doc.uri.fsPath, doc.getText());
  const diagrams = session.generate(doc.uri.fsPath);
  cache.set(doc.uri.fsPath, { version: doc.version, diagrams });
  return diagrams;
}

/** Cheap gate so we never parse documents that can't contain diagrams. */
function mightHaveDiagrams(doc: vscode.TextDocument): boolean {
  return doc.getText().includes("Render<");
}

/* ------------------------------ hover -------------------------------- */

const SELECTOR: vscode.DocumentSelector = [
  { language: "typescript" },
  { language: "typescriptreact" },
];

class RenderHoverProvider implements vscode.HoverProvider {
  async provideHover(
    doc: vscode.TextDocument,
    pos: vscode.Position,
  ): Promise<vscode.Hover | undefined> {
    if (!mightHaveDiagrams(doc)) return;
    const range = doc.getWordRangeAtPosition(pos);
    if (!range) return;

    let word = doc.getText(range);
    // Hovering the `Render` keyword itself resolves to the enclosing alias.
    if (word === "Render") {
      const aliasMatch = /type\s+([A-Za-z_$][\w$]*)\s*=/.exec(
        doc.lineAt(pos.line).text,
      );
      if (!aliasMatch) return;
      word = aliasMatch[1];
    }

    let diagrams: EmittedDiagram[];
    try {
      diagrams = await diagramsFor(doc);
    } catch {
      return; // mid-edit syntax errors etc. — stay quiet
    }
    const diagram = diagrams.find((d) => d.name === word);
    if (!diagram) return;

    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**typescript2mermaid** · \`${diagram.name}\`\n\n`);
    md.appendCodeblock(diagram.code, "mermaid");
    const args = encodeURIComponent(
      JSON.stringify([doc.uri.toString(), diagram.name]),
    );
    md.appendMarkdown(
      `\n[Preview rendered diagram](command:tsMermaid.preview?${args})`,
    );
    md.isTrusted = { enabledCommands: ["tsMermaid.preview"] };
    return new vscode.Hover(md, range);
  }
}

/* ---------------------------- code lenses ---------------------------- */

class RenderCodeLensProvider implements vscode.CodeLensProvider {
  async provideCodeLenses(
    doc: vscode.TextDocument,
  ): Promise<vscode.CodeLens[]> {
    if (!mightHaveDiagrams(doc)) return [];
    let diagrams: EmittedDiagram[];
    try {
      diagrams = await diagramsFor(doc);
    } catch {
      return [];
    }
    const lenses: vscode.CodeLens[] = [];
    const text = doc.getText();
    for (const d of diagrams) {
      const decl = new RegExp(`type\\s+${d.name}\\b`).exec(text);
      if (!decl) continue;
      const position = doc.positionAt(decl.index);
      lenses.push(
        new vscode.CodeLens(new vscode.Range(position, position), {
          title: "Preview diagram",
          command: "tsMermaid.preview",
          arguments: [doc.uri.toString(), d.name],
        }),
      );
    }
    return lenses;
  }
}

/* ----------------------------- preview ------------------------------- */

/**
 * Open panels, keyed by document + diagram name.
 *
 * Every entry owns a webview running its own ~3.5MB Mermaid bundle, so a panel
 * is a genuinely expensive object: we reuse one whenever the same diagram is
 * previewed again rather than stacking duplicates.
 */
const previews = new Map<string, vscode.WebviewPanel>();

const previewKey = (uriString: string, name: string) => `${uriString}::${name}`;

/** Locate the bundled Mermaid asset, requiring it to be *readable* — not merely present. */
function mermaidAssetPath(ctx: vscode.ExtensionContext): string | undefined {
  const candidates = [
    path.join(ctx.extensionPath, "media", "mermaid.min.js"),
    path.join(
      ctx.extensionPath,
      "node_modules",
      "mermaid",
      "dist",
      "mermaid.min.js",
    ),
  ];
  for (const p of candidates) {
    try {
      const stat = fs.statSync(p);
      const mode = (stat.mode & 0o777).toString(8);
      // existsSync() is true for a file we cannot open; that distinction is the
      // whole bug this logging exists to expose.
      fs.accessSync(p, fs.constants.R_OK);
      log(`  asset OK: ${p} (${stat.size} bytes, mode ${mode})`);
      return p;
    } catch (e) {
      const exists = fs.existsSync(p);
      log(
        `  asset unusable: ${p} — ${exists ? "exists but unreadable" : "not found"} (${(e as Error).message})`,
      );
    }
  }
  return undefined;
}

async function openPreview(
  ctx: vscode.ExtensionContext,
  uriString: string,
  name: string,
): Promise<void> {
  log(`preview requested: ${name} in ${uriString}`);
  const doc = await vscode.workspace.openTextDocument(
    vscode.Uri.parse(uriString),
  );

  let diagram: EmittedDiagram | undefined;
  try {
    const diagrams = await diagramsFor(doc);
    log(`  generated ${diagrams.length} diagram(s): ${diagrams.map((d) => d.name).join(", ") || "<none>"}`);
    diagram = diagrams.find((d) => d.name === name);
  } catch (e) {
    log(`  GENERATION FAILED: ${(e as Error).message}`);
    void vscode.window.showErrorMessage(
      `typescript2mermaid: could not generate "${name}" — see the typescript2mermaid Output channel.`,
    );
    return;
  }
  if (!diagram) {
    log(`  diagram "${name}" not found`);
    void vscode.window.showWarningMessage(
      `typescript2mermaid: diagram "${name}" not found.`,
    );
    return;
  }
  log(`  mermaid source (${diagram.code.length} chars):\n${diagram.code}`);

  log(`  extensionPath: ${ctx.extensionPath}`);
  const mermaidPath = mermaidAssetPath(ctx);
  if (!mermaidPath) {
    log("  ABORT: no readable mermaid.min.js");
    void vscode.window.showErrorMessage(
      "typescript2mermaid: mermaid.min.js asset is missing or unreadable — re-run the build (node build.mjs). See the typescript2mermaid Output channel.",
    );
    return;
  }

  const key = previewKey(uriString, name);
  let panel = previews.get(key);
  if (panel) {
    log("  reusing existing panel");
    panel.reveal(panel.viewColumn ?? vscode.ViewColumn.Beside, true);
  } else {
    log("  creating new panel");
    panel = vscode.window.createWebviewPanel(
      "tsMermaidPreview",
      `Diagram: ${name}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.file(path.dirname(mermaidPath))],
      },
    );
    previews.set(key, panel);
    panel.onDidDispose(() => {
      log(`preview closed: ${name}`);
      previews.delete(key);
    });
    // The webview reports its own progress and failures back over this channel.
    panel.webview.onDidReceiveMessage((m) => {
      if (m?.type === "log") log(`  [webview] ${m.message}`);
    });
  }

  log(`  localResourceRoots: ${path.dirname(mermaidPath)}`);
  const scriptUri = panel.webview.asWebviewUri(vscode.Uri.file(mermaidPath));
  log(`  script URI: ${scriptUri.toString()}`);

  // Assigning html reloads the webview, so a reused panel picks up edits made
  // since it was opened.
  const html = previewHtml(panel.webview, scriptUri.toString(), diagram.code);
  log(`  cspSource: ${panel.webview.cspSource}`);
  log(`  html assigned (${html.length} chars); waiting on webview...`);
  panel.webview.html = html;
}

function nonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++)
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}

/** Exported so the render can be exercised headlessly; not part of the extension API. */
export function previewHtml(
  webview: Pick<vscode.Webview, "cspSource">,
  mermaidScriptUri: string,
  code: string,
): string {
  const n = nonce();
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${n}';">
  <style>
    body { padding: 2rem; font-family: var(--vscode-font-family); }
    #diagram { display: flex; justify-content: center; }
    #diagram svg { max-width: 100%; height: auto; }
    #error {
      white-space: pre-wrap;
      font-family: var(--vscode-editor-font-family, monospace);
      color: var(--vscode-errorForeground);
      border: 1px solid var(--vscode-errorForeground);
      border-radius: 4px;
      padding: 1rem;
    }
    [hidden] { display: none !important; }
  </style>
</head>
<body>
  <div id="diagram"></div>
  <div id="error" hidden></div>
  <script nonce="${n}" src="${mermaidScriptUri}" onerror="window.__tsmScriptFailed = true"></script>
  <script nonce="${n}">
    (function () {
      // Mirror progress to the extension's Output channel; the webview console is
      // otherwise only reachable through the webview developer tools.
      let post = function () {};
      try {
        const api = acquireVsCodeApi();
        post = (message) => api.postMessage({ type: "log", message });
      } catch (e) { /* no webview host (headless harness) */ }

      window.addEventListener("error", (e) =>
        post("window.onerror: " + e.message + " @ " + (e.filename || "?") + ":" + e.lineno));
      window.addEventListener("securitypolicyviolation", (e) =>
        post("CSP VIOLATION: blocked=" + e.blockedURI + " directive=" + e.violatedDirective));

      const errorEl = document.getElementById("error");
      function fail(message) {
        post("FAILED: " + message);
        errorEl.hidden = false;
        errorEl.textContent = message;
      }

      post("webview script running; typeof mermaid=" + typeof mermaid +
           "; scriptLoadFailed=" + !!window.__tsmScriptFailed);

      // Previously a missing bundle left the raw Mermaid source on screen, which
      // looks like a rendering bug rather than an asset that never loaded.
      if (typeof mermaid === "undefined") {
        fail("Failed to load mermaid.min.js.\\nThe webview could not fetch the extension asset — re-run the build and reinstall.");
        return;
      }

      const dark =
        document.body.classList.contains("vscode-dark") ||
        document.body.classList.contains("vscode-high-contrast");

      try {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: dark ? "dark" : "default",
        });
        post("initialized (theme=" + (dark ? "dark" : "default") + "); rendering...");
      } catch (e) {
        fail("mermaid.initialize threw: " + ((e && e.message) || e));
        return;
      }

      mermaid
        .render("tsm-diagram", ${JSON.stringify(code)})
        .then(({ svg }) => {
          document.getElementById("diagram").innerHTML = svg;
          post("render OK (" + svg.length + " chars of svg)");
        })
        .catch((e) => fail("mermaid.render rejected: " + ((e && e.message) || e)));
    })();
  </script>
</body>
</html>`;
}

/* ----------------------------- activate ------------------------------ */

export function activate(ctx: vscode.ExtensionContext): void {
  log(`activated (extension ${ctx.extensionPath})`);
  log(`VSCode ${vscode.version}`);

  ctx.subscriptions.push(
    out,
    vscode.commands.registerCommand("tsMermaid.showLog", () => out.show()),
    vscode.languages.registerHoverProvider(SELECTOR, new RenderHoverProvider()),
    vscode.languages.registerCodeLensProvider(
      SELECTOR,
      new RenderCodeLensProvider(),
    ),
    vscode.commands.registerCommand(
      "tsMermaid.preview",
      (uriString: string, name: string) => openPreview(ctx, uriString, name),
    ),

    // The diagram cache is keyed by path and would otherwise retain every file
    // ever hovered for the lifetime of the window.
    vscode.workspace.onDidCloseTextDocument((doc) =>
      cache.delete(doc.uri.fsPath),
    ),
  );
}

export function deactivate(): void {
  for (const panel of previews.values()) panel.dispose();
  previews.clear();
  sessions.clear();
  cache.clear();
}
