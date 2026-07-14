import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";

// Resolved by build.mjs (esbuild alias) and tsconfig `paths` to the vendored
// library source next to this folder — compiled straight into the bundle.
import { GeneratorSession, type EmittedDiagram } from "typescript2mermaid-lib";

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
    md.isTrusted = true;
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

async function openPreview(
  ctx: vscode.ExtensionContext,
  uriString: string,
  name: string,
): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(
    vscode.Uri.parse(uriString),
  );
  const diagram = (await diagramsFor(doc)).find((d) => d.name === name);
  if (!diagram) {
    void vscode.window.showWarningMessage(
      `typescript2mermaid: diagram "${name}" not found.`,
    );
    return;
  }

  const mermaidCandidates = [
    path.join(ctx.extensionPath, "media", "mermaid.min.js"),
    path.join(
      ctx.extensionPath,
      "node_modules",
      "mermaid",
      "dist",
      "mermaid.min.js",
    ),
  ];
  const mermaidPath = mermaidCandidates.find((p) => fs.existsSync(p));
  if (!mermaidPath) {
    void vscode.window.showErrorMessage(
      "typescript2mermaid: mermaid.min.js asset missing — run the build (node build.mjs).",
    );
    return;
  }
  const mermaidJs = vscode.Uri.file(mermaidPath);
  const panel = vscode.window.createWebviewPanel(
    "tsMermaidPreview",
    `Diagram: ${name}`,
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.dirname(mermaidJs.fsPath))],
    },
  );
  const scriptUri = panel.webview.asWebviewUri(mermaidJs);
  panel.webview.html = previewHtml(scriptUri.toString(), diagram.code);
}

function previewHtml(mermaidScriptUri: string, code: string): string {
  const escaped = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { display: flex; justify-content: center; padding: 2rem; }
    .mermaid { max-width: 100%; }
  </style>
</head>
<body>
  <pre class="mermaid">${escaped}</pre>
  <script src="${mermaidScriptUri}"></script>
  <script>
    const dark = document.body.classList.contains("vscode-dark")
      || document.body.classList.contains("vscode-high-contrast");
    mermaid.initialize({ startOnLoad: true, theme: dark ? "dark" : "default" });
  </script>
</body>
</html>`;
}

/* ----------------------------- activate ------------------------------ */

export function activate(ctx: vscode.ExtensionContext): void {
  ctx.subscriptions.push(
    vscode.languages.registerHoverProvider(SELECTOR, new RenderHoverProvider()),
    vscode.languages.registerCodeLensProvider(
      SELECTOR,
      new RenderCodeLensProvider(),
    ),
    vscode.commands.registerCommand(
      "tsMermaid.preview",
      (uriString: string, name: string) => openPreview(ctx, uriString, name),
    ),
  );
}

export function deactivate(): void {
  sessions.clear();
  cache.clear();
}
