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
  return doc.getText().includes(".Diagram<");
}

/* ------------------------------ hover -------------------------------- */

const SELECTOR: vscode.DocumentSelector = [
  { language: "typescript" },
  { language: "typescriptreact" },
];

class DiagramHoverProvider implements vscode.HoverProvider {
  async provideHover(
    doc: vscode.TextDocument,
    pos: vscode.Position,
  ): Promise<vscode.Hover | undefined> {
    if (!mightHaveDiagrams(doc)) return;
    const range = doc.getWordRangeAtPosition(pos);
    if (!range) return;

    let diagrams: EmittedDiagram[];
    try {
      diagrams = await diagramsFor(doc);
    } catch {
      return; // mid-edit syntax errors etc. — stay quiet
    }

    const word = doc.getText(range);
    // Hovering the alias name resolves directly. Otherwise, hovering anywhere
    // on the declaration line — the family, `Diagram`, an argument — resolves
    // to the alias declared on that line.
    const diagram =
      diagrams.find((d) => d.name === word) ??
      (() => {
        const alias = /type\s+([A-Za-z_$][\w$]*)\s*=/.exec(
          doc.lineAt(pos.line).text,
        )?.[1];
        return alias ? diagrams.find((d) => d.name === alias) : undefined;
      })();
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

class DiagramCodeLensProvider implements vscode.CodeLensProvider {
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
 * An open preview panel and the files whose edits should re-render it.
 *
 * Every entry owns a webview running its own ~3.5MB Mermaid bundle, so a panel
 * is a genuinely expensive object: we reuse one whenever the same diagram is
 * previewed again rather than stacking duplicates.
 */
interface Preview {
  panel: vscode.WebviewPanel;
  uriString: string;
  name: string;
  /**
   * The previewed file plus its transitive imports. A diagram's nodes are
   * usually types declared in *other* modules — the checker resolves them at
   * generation time — so watching only the previewed file would miss the edits
   * that actually change the output.
   */
  deps: Set<string>;
  /** Last Mermaid pushed, so an edit that doesn't alter the diagram is a no-op. */
  code: string;
}

/** Open panels, keyed by document + diagram name. */
const previews = new Map<string, Preview>();

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
  let panel = previews.get(key)?.panel;
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
    panel.onDidDispose(() => {
      log(`preview closed: ${name}`);
      closePreview(key);
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
  // since it was opened. (Later updates are pushed as messages instead.)
  const html = previewHtml(panel.webview, scriptUri.toString(), diagram.code);
  log(`  cspSource: ${panel.webview.cspSource}`);
  log(`  html assigned (${html.length} chars); waiting on webview...`);
  panel.webview.html = html;

  openPreviewTracking(key, {
    panel,
    uriString,
    name,
    deps: dependenciesOf(sessionFor(doc), doc.uri.fsPath),
    code: diagram.code,
  });
}

/* --------------------------- live updates ---------------------------- */

/** Coalesce the burst of events a single keystroke produces. */
const REFRESH_DEBOUNCE_MS = 250;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
const changedFiles = new Set<string>();

/** Catches on-disk edits: external tools, or files with no editor open. */
let fsWatcher: vscode.FileSystemWatcher | undefined;

function openPreviewTracking(key: string, preview: Preview): void {
  previews.set(key, preview);
  log(`  watching ${preview.deps.size} source file(s) for ${preview.name}`);
  if (fsWatcher) return;
  fsWatcher = vscode.workspace.createFileSystemWatcher("**/*.{ts,tsx}");
  const onFs = (uri: vscode.Uri) => noteSourceChanged(uri.fsPath);
  fsWatcher.onDidChange(onFs);
  fsWatcher.onDidCreate(onFs);
  fsWatcher.onDidDelete(onFs);
  log("live: file watcher started");
}

function closePreview(key: string): void {
  previews.delete(key);
  // Nothing to watch for once the last panel is gone.
  if (previews.size === 0 && fsWatcher) {
    fsWatcher.dispose();
    fsWatcher = undefined;
    log("live: file watcher stopped");
  }
}

/**
 * ts-morph always reports forward-slash paths while VS Code's `fsPath` uses the
 * platform separator, so the two must be normalized before they can be compared
 * — otherwise every dependency lookup silently misses on Windows.
 */
const normalizePath = (p: string) => p.replace(/\\/g, "/");

/** The previewed file plus its transitive imports, limited to files a user edits. */
function dependenciesOf(
  session: GeneratorSession,
  fsPath: string,
): Set<string> {
  try {
    return new Set(
      session
        .dependencies(fsPath)
        .filter((f) => !f.includes("node_modules"))
        .map(normalizePath),
    );
  } catch (e) {
    log(`live: dependency scan failed for ${fsPath} — ${(e as Error).message}`);
    return new Set([normalizePath(fsPath)]);
  }
}

function noteSourceChanged(rawPath: string): void {
  const fsPath = normalizePath(rawPath);
  let watched = false;
  for (const preview of previews.values())
    if (preview.deps.has(fsPath)) watched = true;
  if (!watched) return;

  changedFiles.add(fsPath);
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = undefined;
    void refreshAffectedPreviews();
  }, REFRESH_DEBOUNCE_MS);
}

async function refreshAffectedPreviews(): Promise<void> {
  const files = [...changedFiles];
  changedFiles.clear();
  for (const preview of [...previews.values()])
    if (files.some((f) => preview.deps.has(f)))
      await refreshPreview(preview, files);
}

/** Push a file's newest content into the session; an open buffer beats disk. */
function syncIntoSession(session: GeneratorSession, fsPath: string): void {
  const open = vscode.workspace.textDocuments.find(
    (d) => d.uri.fsPath === fsPath,
  );
  try {
    session.updateFile(
      fsPath,
      open ? open.getText() : fs.readFileSync(fsPath, "utf8"),
    );
  } catch (e) {
    // A deleted or unreadable dependency just means this pass can't improve on
    // what's already displayed.
    log(`live: could not read ${fsPath} — ${(e as Error).message}`);
  }
}

async function refreshPreview(
  preview: Preview,
  changed: string[],
): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(
    vscode.Uri.parse(preview.uriString),
  );
  const session = sessionFor(doc);
  for (const file of changed) syncIntoSession(session, file);

  // A dependency edit doesn't bump the previewed document's version, so the
  // version-keyed cache would happily serve the stale diagram.
  cache.delete(doc.uri.fsPath);

  let diagrams: EmittedDiagram[];
  try {
    diagrams = await diagramsFor(doc);
  } catch (e) {
    // Half-typed code is a constant state while editing; keep the last good
    // diagram on screen rather than flashing an error at every keystroke.
    log(`live: generation failed for ${preview.name} — ${(e as Error).message}`);
    return;
  }

  // An edit can add or remove an import, so re-derive what to watch.
  preview.deps = dependenciesOf(session, doc.uri.fsPath);

  const diagram = diagrams.find((d) => d.name === preview.name);
  if (!diagram) {
    log(`live: "${preview.name}" is no longer declared in ${doc.uri.fsPath}`);
    return;
  }
  if (diagram.code === preview.code) return; // edit didn't change the diagram
  preview.code = diagram.code;
  log(`live: re-rendering ${preview.name}`);
  void preview.panel.webview.postMessage({
    type: "render",
    code: diagram.code,
  });
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
    html, body { height: 100%; margin: 0; }
    body {
      display: flex;
      flex-direction: column;
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    #toolbar {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.35rem 0.5rem;
      border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.35));
    }
    #toolbar button {
      background: var(--vscode-button-secondaryBackground, transparent);
      color: var(--vscode-button-secondaryForeground, inherit);
      border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.35));
      border-radius: 4px;
      padding: 0.15rem 0.5rem;
      min-width: 1.9rem;
      cursor: pointer;
      font: inherit;
      line-height: 1.4;
    }
    #toolbar button:hover {
      background: var(--vscode-button-secondaryHoverBackground, rgba(128,128,128,0.2));
    }
    #zoom-level {
      min-width: 3.4rem;
      text-align: center;
      opacity: 0.85;
      font-variant-numeric: tabular-nums;
    }
    #hint { margin-left: auto; opacity: 0.6; font-size: 0.85em; }
    /* The viewport clips; #canvas is what actually moves and scales. */
    #viewport { flex: 1 1 auto; position: relative; overflow: hidden; cursor: grab; }
    #viewport.panning { cursor: grabbing; }
    #canvas { position: absolute; top: 0; left: 0; transform-origin: 0 0; will-change: transform; }
    #error {
      margin: 1rem;
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
  <div id="toolbar" hidden>
    <button id="zoom-out" title="Zoom out">&#8722;</button>
    <span id="zoom-level">100%</span>
    <button id="zoom-in" title="Zoom in">+</button>
    <button id="fit" title="Fit diagram to window">Fit</button>
    <button id="reset" title="Actual size">1:1</button>
    <span id="hint">drag to pan &middot; scroll to move &middot; ctrl/&#8984; + scroll to zoom</span>
  </div>
  <div id="viewport" hidden><div id="canvas"></div></div>
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
      const toolbar = document.getElementById("toolbar");
      const viewport = document.getElementById("viewport");
      const canvas = document.getElementById("canvas");
      const zoomLevel = document.getElementById("zoom-level");

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

      /* ------------------------- pan / zoom ------------------------- */

      const MIN_SCALE = 0.1, MAX_SCALE = 8;
      let scale = 1, tx = 0, ty = 0;
      let natW = 0, natH = 0;
      // Once the view is deliberately positioned, a resize must not yank it back.
      let userAdjusted = false;

      const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

      function apply() {
        canvas.style.transform =
          "translate(" + tx + "px," + ty + "px) scale(" + scale + ")";
        zoomLevel.textContent = Math.round(scale * 100) + "%";
      }

      // Keep the point under the cursor fixed while the scale changes.
      function zoomAt(cx, cy, factor) {
        const next = clamp(scale * factor, MIN_SCALE, MAX_SCALE);
        if (next === scale) return;
        tx = cx - (cx - tx) * (next / scale);
        ty = cy - (cy - ty) * (next / scale);
        scale = next;
        userAdjusted = true;
        apply();
      }

      function centerAt(s) {
        const r = viewport.getBoundingClientRect();
        scale = clamp(s, MIN_SCALE, MAX_SCALE);
        tx = (r.width - natW * scale) / 2;
        ty = (r.height - natH * scale) / 2;
        apply();
      }

      function fit() {
        const r = viewport.getBoundingClientRect();
        const pad = 24;
        // Never scale a small diagram up past 1:1 just to fill the panel.
        const s = Math.min((r.width - pad * 2) / natW, (r.height - pad * 2) / natH, 1);
        centerAt(s);
        userAdjusted = false;
      }

      function mount(svgText, preserveView) {
        const hadDiagram = natW > 0;
        canvas.innerHTML = svgText;
        const svg = canvas.querySelector("svg");
        if (!svg) { fail("mermaid returned no <svg>"); return; }
        // Mermaid emits width=100% + an inline max-width, which fights a scale
        // transform. Pin the SVG to its intrinsic viewBox size instead.
        const vb = svg.viewBox && svg.viewBox.baseVal;
        natW = (vb && vb.width) || svg.getBoundingClientRect().width || 800;
        natH = (vb && vb.height) || svg.getBoundingClientRect().height || 600;
        svg.removeAttribute("width");
        svg.removeAttribute("height");
        svg.style.maxWidth = "none";
        svg.style.width = natW + "px";
        svg.style.height = natH + "px";
        svg.style.display = "block";
        toolbar.hidden = false;
        viewport.hidden = false;
        // A live re-render must not yank a deliberately positioned view back to
        // fit; only an untouched view (or a first render) re-fits.
        if (preserveView && hadDiagram && userAdjusted) apply();
        else fit();
      }

      document.getElementById("zoom-in").addEventListener("click", () => {
        const r = viewport.getBoundingClientRect();
        zoomAt(r.width / 2, r.height / 2, 1.25);
      });
      document.getElementById("zoom-out").addEventListener("click", () => {
        const r = viewport.getBoundingClientRect();
        zoomAt(r.width / 2, r.height / 2, 1 / 1.25);
      });
      document.getElementById("fit").addEventListener("click", fit);
      document.getElementById("reset").addEventListener("click", () => {
        centerAt(1);
        userAdjusted = true;
      });

      viewport.addEventListener("wheel", (e) => {
        e.preventDefault();
        const r = viewport.getBoundingClientRect();
        if (e.ctrlKey || e.metaKey) {
          zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.1 : 1 / 1.1);
        } else {
          tx -= e.deltaX;
          ty -= e.deltaY;
          userAdjusted = true;
          apply();
        }
      }, { passive: false });

      let panning = false, startX = 0, startY = 0;
      viewport.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        panning = true;
        startX = e.clientX - tx;
        startY = e.clientY - ty;
        viewport.classList.add("panning");
        try { viewport.setPointerCapture(e.pointerId); } catch (_) {}
      });
      viewport.addEventListener("pointermove", (e) => {
        if (!panning) return;
        tx = e.clientX - startX;
        ty = e.clientY - startY;
        userAdjusted = true;
        apply();
      });
      function endPan(e) {
        if (!panning) return;
        panning = false;
        viewport.classList.remove("panning");
        try { viewport.releasePointerCapture(e.pointerId); } catch (_) {}
      }
      viewport.addEventListener("pointerup", endPan);
      viewport.addEventListener("pointercancel", endPan);

      window.addEventListener("resize", () => {
        if (natW && !userAdjusted) fit();
      });

      /* --------------------------- render --------------------------- */

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

      // Mermaid keys internal state off the render id, so each pass needs a
      // fresh one.
      let renderSeq = 0;
      function renderDiagram(code, preserveView) {
        renderSeq += 1;
        mermaid
          .render("tsm-diagram-" + renderSeq, code)
          .then(({ svg }) => {
            errorEl.hidden = true;
            mount(svg, preserveView);
            post("render OK (" + svg.length + " chars of svg, " +
                 Math.round(natW) + "x" + Math.round(natH) + " natural)");
          })
          .catch((e) => fail("mermaid.render rejected: " + ((e && e.message) || e)));
      }

      // Live updates: the extension re-generates whenever a source file behind
      // this diagram changes and pushes the new Mermaid in. Re-rendering in
      // place beats reassigning the panel's html, which would reload the whole
      // Mermaid bundle and throw away the viewer's pan/zoom.
      window.addEventListener("message", (event) => {
        const m = event.data;
        if (m && m.type === "render") renderDiagram(m.code, true);
      });

      renderDiagram(${JSON.stringify(code)}, false);
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
    vscode.languages.registerHoverProvider(SELECTOR, new DiagramHoverProvider()),
    vscode.languages.registerCodeLensProvider(
      SELECTOR,
      new DiagramCodeLensProvider(),
    ),
    vscode.commands.registerCommand(
      "tsMermaid.preview",
      (uriString: string, name: string) => openPreview(ctx, uriString, name),
    ),

    // Live preview: unsaved edits in any file behind an open diagram. This is
    // the common case; the fs watcher (started with the first preview) covers
    // changes made outside the editor.
    vscode.workspace.onDidChangeTextDocument((e) =>
      noteSourceChanged(e.document.uri.fsPath),
    ),

    // The diagram cache is keyed by path and would otherwise retain every file
    // ever hovered for the lifetime of the window.
    vscode.workspace.onDidCloseTextDocument((doc) =>
      cache.delete(doc.uri.fsPath),
    ),
  );
}

export function deactivate(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = undefined;
  fsWatcher?.dispose();
  fsWatcher = undefined;
  for (const preview of previews.values()) preview.panel.dispose();
  previews.clear();
  sessions.clear();
  cache.clear();
}
