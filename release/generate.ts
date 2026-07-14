import { Project, SourceFile, SyntaxKind, TypeNode } from "ts-morph";
import {
  argsOf,
  boolOf,
  escapeLabel,
  fail,
  idOf,
  lastName,
  numOf,
  numericLiteralProps,
  qualifierOf,
  resolveAlias,
  resolveMembers,
  strOf,
  tupleOf,
} from "./parse.js";

export interface EmittedDiagram {
  /** The name of the `type X = Diagram<...>` alias. */
  name: string;
  /** Source file the diagram was declared in. */
  file: string;
  /** Rendered Mermaid code (no markdown fence). */
  code: string;
}

/* ================================ entry ================================ */

export function generateFromFiles(
  filePaths: string[],
  tsConfigFilePath?: string,
): EmittedDiagram[] {
  const project = tsConfigFilePath
    ? new Project({ tsConfigFilePath })
    : new Project({ compilerOptions: { strict: true } });
  const files = filePaths.map((f) => project.addSourceFileAtPath(f));
  project.resolveSourceFileDependencies();
  return files.flatMap((sf) => generateFromSourceFile(sf));
}

export function generateFromSource(
  code: string,
  fileName = "diagram.ts",
): EmittedDiagram[] {
  const project = new Project({
    compilerOptions: { strict: true },
    useInMemoryFileSystem: true,
  });
  // Provide the DSL module in-memory so `import type { ... } from "typescript2mermaid"` resolves.
  return generateFromSourceFile(project.createSourceFile(fileName, code));
}

export function generateFromSourceFile(sf: SourceFile): EmittedDiagram[] {
  const out: EmittedDiagram[] = [];
  for (const alias of sf.getTypeAliases()) {
    const tn = alias.getTypeNode();
    if (lastName(tn) !== "Render") continue;
    const [body, options] = argsOf(tn);
    if (!body) fail("Render<...> requires a diagram type argument", tn);
    const code = renderDiagram(body, options);
    out.push({ name: alias.getName(), file: sf.getFilePath(), code });
  }
  return out;
}

/* ============================== dispatch =============================== */

function renderDiagram(body: TypeNode, options?: TypeNode): string {
  const prefix = renderOptions(options);
  // `Render<Flow>` where `type Flow = Flowchart.Diagram<...>` should behave
  // exactly like inlining the alias — this is how one diagram gets reused across
  // several Render<> aliases that differ only in options (see examples/flowchart/themes.ts).
  const diagram = resolveAlias(body) ?? body;
  if (lastName(diagram) !== "Diagram")
    fail(`Render<> expects a <Family>.Diagram<...> type`, body);
  const kind = qualifierOf(diagram);
  switch (kind) {
    case "Flowchart":
      return prefix + renderFlowchart(diagram);
    case "Sequence":
      return prefix + renderSequence(diagram);
    case "ClassDiagram":
      return prefix + renderClassDiagram(diagram);
    case "State":
      return prefix + renderState(diagram);
    case "Entity":
      return prefix + renderER(diagram);
    case "Journey":
      return prefix + renderJourney(diagram);
    case "Pie":
      return prefix + renderPie(diagram);
    case "Gantt":
      return prefix + renderGantt(diagram);
    default:
      fail(`unknown diagram kind \`${kind ?? diagram.getText()}\``, diagram);
  }
}

function renderOptions(options?: TypeNode): string {
  if (!options) return "";
  for (const opt of tupleOf(options)) {
    if (lastName(opt) === "Theme") {
      const theme = strOf(argsOf(opt)[0]) ?? "default";
      return `%%{init: {'theme':'${theme}'}}%%\n`;
    }
  }
  return "";
}

/* ============================== flowchart ============================== */

const FLOW_DIRECTIONS: Record<string, string> = {
  topdown: "TD",
  bottomup: "BT",
  leftright: "LR",
  rightleft: "RL",
};

const EDGES: Record<string, { plain: string; labeled: (l: string) => string }> =
  {
    arrow: { plain: "-->", labeled: (l) => `-->|${l}|` },
    line: { plain: "---", labeled: (l) => `---|${l}|` },
    dotted: { plain: "-.->", labeled: (l) => `-.->|${l}|` },
    thick: { plain: "==>", labeled: (l) => `==>|${l}|` },
    circle: { plain: "--o", labeled: (l) => `--o|${l}|` },
    cross: { plain: "--x", labeled: (l) => `--x|${l}|` },
  };

const SHAPES: Record<string, [string, string]> = {
  rectangle: ["[", "]"],
  rounded: ["(", ")"],
  stadium: ["([", "])"],
  subroutine: ["[[", "]]"],
  database: ["[(", ")]"],
  circle: ["((", "))"],
  diamond: ["{", "}"],
  hexagon: ["{{", "}}"],
  parallelogram: ["[/", "/]"],
  "parallelogram-alternate": ["[\\", "\\]"],
};

interface FlowNode {
  id: string;
  shape: string;
  /** undefined → auto (expand resolved type); string → custom; false → bare name */
  label?: string | false;
  typeNode: TypeNode;
  declared: boolean; // already emitted with its bracket label
}

class FlowContext {
  nodes = new Map<string, FlowNode>();

  register(t: TypeNode): FlowNode {
    const id = idOf(t);
    let node = this.nodes.get(id);
    if (!node) {
      node = { id, shape: "rectangle", typeNode: t, declared: false };
      this.nodes.set(id, node);
    }
    return node;
  }

  /** Node reference for use in an edge/subgraph line; includes the bracket label on first use. */
  refText(t: TypeNode): string {
    const node = this.register(t);
    if (node.declared) return node.id;
    node.declared = true;
    return node.id + this.bracketLabel(node);
  }

  bracketLabel(node: FlowNode): string {
    const [open, close] = SHAPES[node.shape] ?? SHAPES.rectangle;
    if (node.label === false)
      return node.shape === "rectangle"
        ? ""
        : `${open}"${escapeLabel(node.id)}"${close}`;
    if (typeof node.label === "string")
      return `${open}"${escapeLabel(node.label)}"${close}`;
    // Auto: expand the fully-resolved type when it has members.
    const members = safeMembers(node.typeNode);
    if (members.length === 0) {
      return node.shape === "rectangle"
        ? ""
        : `${open}"${escapeLabel(node.id)}"${close}`;
    }
    const lines = members.map((m) =>
      m.isMethod
        ? `${m.name}(${m.params})${m.returns ? ": " + m.returns : ""}`
        : `${m.name}: ${m.typeText}`,
    );
    return `${open}"${escapeLabel([node.id, ...lines].join("<br/>"))}"${close}`;
  }
}

function safeMembers(t: TypeNode) {
  try {
    return resolveMembers(t);
  } catch {
    return [];
  }
}

function renderFlowchart(body: TypeNode): string {
  const [dirNode, bodyNode] = argsOf(body);
  const dirRaw = strOf(dirNode) ?? "TD";
  const dir =
    FLOW_DIRECTIONS[dirRaw] ??
    fail(`unknown flowchart direction "${dirRaw}"`, dirNode);
  const ctx = new FlowContext();
  const lines: string[] = [`flowchart ${dir}`];

  const statements = bodyNode ? tupleOf(bodyNode) : [];
  // First pass: apply Node<> declarations so shapes/labels are known before edges render.
  for (const st of statements) collectNodeDecls(st, ctx);
  // Second pass: emit.
  for (const st of statements) emitFlowStatement(st, ctx, lines, "    ");
  // Any registered-but-never-declared nodes with expandable content (e.g. Node<> only): ensure emitted.
  for (const node of ctx.nodes.values()) {
    if (!node.declared) {
      node.declared = true;
      const bracket = ctx.bracketLabel(node);
      if (bracket) lines.push(`    ${node.id}${bracket}`);
      else if (ctx.nodes.size === 1) lines.push(`    ${node.id}`); // single bare node body
    }
  }
  return lines.join("\n");
}

function collectNodeDecls(st: TypeNode, ctx: FlowContext): void {
  const kind = lastName(st);
  if (kind === "Node") {
    const [t, shape, label] = argsOf(st);
    const node = ctx.register(t ?? fail("Node<> requires a type", st));
    if (shape) node.shape = strOf(shape) ?? node.shape;
    if (label) {
      const s = strOf(label);
      if (s !== undefined) node.label = s;
      else if (boolOf(label) === false) node.label = false;
    }
  } else if (kind === "Subgraph") {
    for (const m of tupleOf(argsOf(st)[1])) collectNodeDecls(m, ctx);
  }
}

function emitFlowStatement(
  st: TypeNode,
  ctx: FlowContext,
  lines: string[],
  indent: string,
): void {
  const kind = lastName(st);
  switch (kind) {
    case "Connect": {
      const [from, to, label, style] = argsOf(st);
      if (!from || !to) fail("Connect<From, To> requires two types", st);
      const edge =
        EDGES[strOf(style) ?? "arrow"] ?? fail(`unknown edge style`, style);
      const labelText = strOf(label);
      const arrow =
        labelText !== undefined ? edge.labeled(labelText) : edge.plain;
      lines.push(`${indent}${ctx.refText(from)} ${arrow} ${ctx.refText(to)}`);
      return;
    }
    case "Node": {
      // Emit the node declaration if it hasn't appeared yet.
      const [t] = argsOf(st);
      const node = ctx.register(t!);
      if (!node.declared) {
        node.declared = true;
        const bracket = ctx.bracketLabel(node);
        lines.push(`${indent}${node.id}${bracket}`);
      }
      return;
    }
    case "Subgraph": {
      const [title, members] = argsOf(st);
      lines.push(`${indent}subgraph "${strOf(title) ?? "Subgraph"}"`);
      for (const m of tupleOf(members)) {
        if (
          lastName(m) &&
          [
            "Connect",
            "Node",
            "Subgraph",
            "Style",
            "DefineClass",
            "ApplyClass",
          ].includes(lastName(m)!)
        ) {
          emitFlowStatement(m, ctx, lines, indent + "    ");
        } else {
          lines.push(`${indent}    ${ctx.refText(m)}`);
        }
      }
      lines.push(`${indent}end`);
      return;
    }
    case "Style": {
      const [t, css] = argsOf(st);
      lines.push(`${indent}style ${idOf(t!)} ${strOf(css) ?? ""}`);
      return;
    }
    case "DefineClass": {
      const [name, css] = argsOf(st);
      lines.push(`${indent}classDef ${strOf(name)} ${strOf(css) ?? ""}`);
      return;
    }
    case "ApplyClass": {
      const [targets, name] = argsOf(st);
      const ids = tupleOf(targets)
        .map((t) => idOf(t))
        .join(",");
      lines.push(`${indent}class ${ids} ${strOf(name)}`);
      return;
    }
    default: {
      // A bare type reference in the body → standalone node.
      const text = ctx.refText(st);
      lines.push(`${indent}${text}`);
    }
  }
}

/* ============================== sequence =============================== */

function renderSequence(body: TypeNode): string {
  const lines: string[] = ["sequenceDiagram"];
  const statements = tupleOf(argsOf(body)[0]);
  for (const st of statements) emitSeqStatement(st, lines, "    ");
  return lines.join("\n");
}

function seqArrow(base: string, activation?: string): string {
  if (activation === "activate") return base + "+";
  if (activation === "deactivate") return base + "-";
  return base;
}

function emitSeqStatement(st: TypeNode, lines: string[], indent: string): void {
  const kind = lastName(st);
  const args = argsOf(st);
  switch (kind) {
    case "Participant":
    case "Actor": {
      const [t, alias] = args;
      const keyword = kind === "Actor" ? "actor" : "participant";
      const a = strOf(alias);
      lines.push(`${indent}${keyword} ${idOf(t!)}${a ? ` as ${a}` : ""}`);
      return;
    }
    case "Message":
    case "Reply": {
      const [from, to, text, act] = args;
      const base = kind === "Message" ? "->>" : "-->>";
      const arrow = seqArrow(base, strOf(act));
      lines.push(
        `${indent}${idOf(from!)}${arrow}${idOf(to!)}: ${strOf(text) ?? ""}`,
      );
      return;
    }
    case "Lost": {
      const [from, to, text] = args;
      lines.push(`${indent}${idOf(from!)}-x${idOf(to!)}: ${strOf(text) ?? ""}`);
      return;
    }
    case "Async": {
      const [from, to, text] = args;
      lines.push(`${indent}${idOf(from!)}-)${idOf(to!)}: ${strOf(text) ?? ""}`);
      return;
    }
    case "NoteOver": {
      const [targets, text] = args;
      const ids = tupleOf(targets)
        .map((t) => idOf(t))
        .join(",");
      lines.push(`${indent}Note over ${ids}: ${strOf(text) ?? ""}`);
      return;
    }
    case "NoteRight": {
      const [t, text] = args;
      lines.push(`${indent}Note right of ${idOf(t!)}: ${strOf(text) ?? ""}`);
      return;
    }
    case "NoteLeft": {
      const [t, text] = args;
      lines.push(`${indent}Note left of ${idOf(t!)}: ${strOf(text) ?? ""}`);
      return;
    }
    case "Loop":
    case "Optional": {
      const [label, inner] = args;
      const keyword = kind === "Optional" ? "opt" : "loop";
      lines.push(`${indent}${keyword} ${strOf(label) ?? ""}`);
      for (const s of tupleOf(inner))
        emitSeqStatement(s, lines, indent + "    ");
      lines.push(`${indent}end`);
      return;
    }
    case "Alternative": {
      const [label, inner, elseLabel, elseInner] = args;
      lines.push(`${indent}alt ${strOf(label) ?? ""}`);
      for (const s of tupleOf(inner))
        emitSeqStatement(s, lines, indent + "    ");
      if (elseInner) {
        lines.push(`${indent}else ${strOf(elseLabel) ?? ""}`);
        for (const s of tupleOf(elseInner))
          emitSeqStatement(s, lines, indent + "    ");
      }
      lines.push(`${indent}end`);
      return;
    }
    default:
      fail(`unknown sequence statement \`${st.getText()}\``, st);
  }
}

/* ============================ class diagram ============================ */

const CLASS_RELS: Record<string, { arrow: string; swap?: boolean }> = {
  Extends: { arrow: "<|--", swap: true }, // Extends<Dog, Animal> → Animal <|-- Dog
  Composition: { arrow: "*--" },
  Aggregation: { arrow: "o--" },
  Association: { arrow: "-->" },
  Link: { arrow: "--" },
  DependsOn: { arrow: "..>" },
  Realizes: { arrow: "..|>" },
  Implements: { arrow: "--|>" },
};

function renderClassDiagram(body: TypeNode): string {
  const lines: string[] = ["classDiagram"];
  const relLines: string[] = [];
  const classes = new Map<string, TypeNode>();

  const include = (t: TypeNode) => {
    const id = idOf(t);
    if (!classes.has(id)) classes.set(id, t);
    return id;
  };

  for (const st of tupleOf(argsOf(body)[0])) {
    const kind = lastName(st);
    const args = argsOf(st);
    if (kind === "Class") {
      include(args[0] ?? fail("Class<> requires a type", st));
    } else if (kind && CLASS_RELS[kind]) {
      const rel = CLASS_RELS[kind];
      const [a, b, label] = args;
      const left = include(rel.swap ? b! : a!);
      const right = include(rel.swap ? a! : b!);
      const l = strOf(label);
      relLines.push(`    ${left} ${rel.arrow} ${right}${l ? ` : ${l}` : ""}`);
    } else {
      fail(`unknown class-diagram statement \`${st.getText()}\``, st);
    }
  }

  // Expand each class into a full definition from its resolved type.
  for (const [id, t] of classes) {
    const members = safeMembers(t);
    if (members.length === 0) {
      lines.push(`    class ${id}`);
      continue;
    }
    lines.push(`    class ${id} {`);
    for (const m of members) {
      if (m.isMethod) {
        lines.push(
          `        ${m.visibility}${m.name}(${m.params})${m.returns ? " " + m.returns : ""}`,
        );
      } else {
        lines.push(`        ${m.visibility}${m.typeText} ${m.name}`);
      }
    }
    lines.push(`    }`);
  }

  lines.push(...relLines);
  return lines.join("\n");
}

/* ============================ state diagram ============================ */

function stateId(t: TypeNode): string {
  const name = lastName(t) ?? t.getText();
  if (name === "Start" || name === "End") return "[*]";
  return idOf(t);
}

function renderState(body: TypeNode): string {
  const lines: string[] = ["stateDiagram-v2"];
  for (const st of tupleOf(argsOf(body)[0]))
    emitStateStatement(st, lines, "    ");
  return lines.join("\n");
}

function emitStateStatement(
  st: TypeNode,
  lines: string[],
  indent: string,
): void {
  const kind = lastName(st);
  const args = argsOf(st);
  switch (kind) {
    case "Transition": {
      const [from, to, label] = args;
      const l = strOf(label);
      lines.push(
        `${indent}${stateId(from!)} --> ${stateId(to!)}${l ? ` : ${l}` : ""}`,
      );
      return;
    }
    case "Composite": {
      const [t, inner] = args;
      lines.push(`${indent}state ${idOf(t!)} {`);
      for (const s of tupleOf(inner))
        emitStateStatement(s, lines, indent + "    ");
      lines.push(`${indent}}`);
      return;
    }
    case "Note": {
      const [t, side, text] = args;
      lines.push(`${indent}note ${strOf(side) ?? "right"} of ${idOf(t!)}`);
      lines.push(`${indent}    ${strOf(text) ?? ""}`);
      lines.push(`${indent}end note`);
      return;
    }
    default:
      fail(`unknown state-diagram statement \`${st.getText()}\``, st);
  }
}

/* ============================== ER diagram ============================= */

const CARDINALITY: Record<string, string> = {
  "one-to-one": "||--||",
  "one-to-many": "||--|{",
  "one-to-zero-or-many": "||--o{",
  "zero-or-one-to-many": "|o--|{",
  "many-to-one": "}|--||",
  "many-to-many": "}|--|{",
};

/** Declared TS type text → conventional ER attribute type. */
const ER_TYPES: Record<string, string> = {
  string: "string",
  number: "int",
  boolean: "boolean",
  Date: "datetime",
  Integer: "int",
  Decimal: "decimal",
  Text: "text",
  DateTime: "datetime",
  Boolean: "boolean",
};

function renderER(body: TypeNode): string {
  const lines: string[] = ["erDiagram"];
  const relLines: string[] = [];
  const entities = new Map<string, TypeNode>();

  const include = (t: TypeNode) => {
    const id = idOf(t);
    if (!entities.has(id)) entities.set(id, t);
    return id;
  };

  for (const st of tupleOf(argsOf(body)[0])) {
    const kind = lastName(st);
    const args = argsOf(st);
    if (kind === "Relation") {
      const [a, b, card, label] = args;
      const c =
        CARDINALITY[strOf(card) ?? ""] ?? fail(`unknown cardinality`, card);
      const l = strOf(label) ?? "";
      const labelText = /\s/.test(l) ? `"${l}"` : l;
      relLines.push(`    ${include(a!)} ${c} ${include(b!)} : ${labelText}`);
    } else if (kind === "Include") {
      include(args[0] ?? fail("Entity.Include<> requires a type", st));
    } else {
      fail(`unknown entity-relationship statement \`${st.getText()}\``, st);
    }
  }

  lines.push(...relLines);
  if (relLines.length && entities.size) lines.push("");

  for (const [id, t] of entities) {
    const members = safeMembers(t);
    if (members.length === 0) continue;
    lines.push(`    ${id} {`);
    for (const m of members) {
      const short = m.typeText.split(".").pop() ?? m.typeText;
      const erType =
        ER_TYPES[short] ?? short.toLowerCase().replace(/[^a-z0-9_]/g, "_");
      const keys = m.keys.length ? " " + m.keys.join(",") : "";
      lines.push(`        ${erType} ${m.name}${keys}`);
    }
    lines.push(`    }`);
  }

  return lines.join("\n");
}

/* =============================== journey =============================== */

function renderJourney(body: TypeNode): string {
  const [title, sections] = argsOf(body);
  const lines: string[] = ["journey", `    title ${strOf(title) ?? ""}`];
  for (const sec of tupleOf(sections)) {
    if (lastName(sec) !== "Section")
      fail("Journey body must contain Section<> entries", sec);
    const [name, tasks] = argsOf(sec);
    lines.push(`    section ${strOf(name) ?? ""}`);
    for (const task of tupleOf(tasks)) {
      if (lastName(task) !== "Task")
        fail("Section body must contain Task<> entries", task);
      const [desc, score, actors] = argsOf(task);
      const actorNames = tupleOf(actors)
        .map((a) => strOf(a) ?? idOf(a))
        .join(", ");
      lines.push(
        `      ${strOf(desc) ?? ""}: ${numOf(score) ?? 3}: ${actorNames}`,
      );
    }
  }
  return lines.join("\n");
}

/* ================================= pie ================================= */

function renderPie(body: TypeNode): string {
  const [title, data] = argsOf(body);
  const lines: string[] = [`pie title ${strOf(title) ?? ""}`];

  const entries = tupleOf(data);
  const isSlices =
    entries.length > 0 && entries.every((e) => lastName(e) === "Slice");
  if (isSlices) {
    for (const s of entries) {
      const [label, value] = argsOf(s);
      lines.push(`    "${strOf(label) ?? ""}" : ${numOf(value) ?? 0}`);
    }
  } else if (data) {
    // Object type body: numeric-literal properties become slices.
    const props = numericLiteralProps(data);
    if (props.length === 0)
      fail(
        "Pie body must be Slice<> entries or a type with numeric-literal properties",
        data,
      );
    for (const p of props) lines.push(`    "${p.name}" : ${p.value}`);
  }
  return lines.join("\n");
}

/* ================================ gantt ================================ */

function renderGantt(body: TypeNode): string {
  const [title, dateFormat, sections] = argsOf(body);
  const lines: string[] = [
    "gantt",
    `    title ${strOf(title) ?? ""}`,
    `    dateFormat  ${strOf(dateFormat) ?? "YYYY-MM-DD"}`,
  ];
  for (const sec of tupleOf(sections)) {
    if (lastName(sec) !== "Section")
      fail("Gantt body must contain Section<> entries", sec);
    const [name, tasks] = argsOf(sec);
    lines.push(`    section ${strOf(name) ?? ""}`);
    for (const task of tupleOf(tasks)) {
      if (lastName(task) !== "Task")
        fail("Section body must contain Gantt.Task<> entries", task);
      const [desc, id, begin, finish, status] = argsOf(task);
      const parts: string[] = [];
      const s = strOf(status);
      if (s) parts.push(s);
      parts.push(strOf(id) ?? "task");
      parts.push(
        lastName(begin) === "After"
          ? `after ${strOf(argsOf(begin)[0])}`
          : (strOf(begin) ?? ""),
      );
      parts.push(strOf(finish) ?? "");
      lines.push(`    ${strOf(desc) ?? ""} :${parts.join(", ")}`);
    }
  }
  return lines.join("\n");
}
