import { Project, SourceFile, TypeNode } from "ts-morph";
import {
  argsOf,
  fail,
  lastName,
  qualifierOf,
  resolveAlias,
  strOf,
  tupleOf,
} from "./parse.js";
import * as Flowchart from "./flowchart.js";
import * as Sequence from "./sequence.js";
import * as Class from "./class.js";
import * as State from "./state.js";
import * as Entity from "./entity.js";
import * as Journey from "./journey.js";
import * as Pie from "./pie.js";
import * as Gantt from "./gantt.js";

/**
 * The diagram families with their `render` function that emits each. Both the DSL
 * specifics and the rendering live in the family's own module; this table only
 * routes to them. Render options are found by the `Options<...>` key, so the
 * dispatcher needs no knowledge of any family's argument shape.
 */
const diagrams = {
  Flowchart,
  Sequence,
  Class,
  State,
  Entity,
  Journey,
  Pie,
  Gantt,
} satisfies Record<string, { render: (diagram: TypeNode) => string }>;

export interface EmittedDiagram {
  /** The name of the `type X = Diagram<...>` alias. */
  name: string;
  /** Source file the diagram was declared in. */
  file: string;
  /** Rendered Mermaid code (no markdown fence). */
  code: string;
}

function _generate(
  paths: string[],
  tsConfigFilePath?: string,
): EmittedDiagram[];
function _generate(code: string, fileName?: string): EmittedDiagram[];
function _generate(source: SourceFile): EmittedDiagram[];
function _generate(
  pathsOrCodeOrSource: string[] | string | SourceFile,
  maybeTsConfigOrFileName?: string,
): EmittedDiagram[] {
  if (pathsOrCodeOrSource instanceof SourceFile)
    return generateFrom.source(pathsOrCodeOrSource);
  if (Array.isArray(pathsOrCodeOrSource))
    return generateFrom.files(pathsOrCodeOrSource, maybeTsConfigOrFileName);
  if (typeof pathsOrCodeOrSource === "string")
    return generateFrom.code(pathsOrCodeOrSource, maybeTsConfigOrFileName);
  throw new Error("Unsupported generate arguments");
}

export const generateFrom = Object.assign(
  {
    files: (paths: string[], tsConfigFilePath?: string): EmittedDiagram[] => {
      const project = new Project(
        tsConfigFilePath
          ? { tsConfigFilePath }
          : { compilerOptions: { strict: true } },
      );
      const files = paths.map((path) => project.addSourceFileAtPath(path));
      project.resolveSourceFileDependencies();
      return files.flatMap((source) => generateFrom.source(source));
    },
    code: (
      code: string,
      fileName: "diagram.ts" | (string & {}) = "diagram.ts",
    ): EmittedDiagram[] =>
      generateFrom.source(
        new Project({
          compilerOptions: { strict: true },
          useInMemoryFileSystem: true,
        }).createSourceFile(fileName, code),
      ),
    source: (source: SourceFile) => {
      const out: EmittedDiagram[] = [];
      for (const alias of source.getTypeAliases()) {
        // Only exported aliases are emitted. An unexported alias is a helper —
        // e.g. a `type Body = [...]` shared across several themed diagrams that
        // differ only in their options (see flowchart/themes.ts).
        if (!alias.isExported()) continue;
        const tn = alias.getTypeNode();
        if (!isDiagramNode(tn)) continue;
        const code = renderDiagram(tn!);
        out.push({ name: alias.getName(), file: source.getFilePath(), code });
      }
      return out;
    },
  } satisfies Record<string, (...args: any[]) => EmittedDiagram[]>,
  _generate,
);

/** True when a type node is (or aliases to) a known `<Family>.Diagram<...>`. */
function isDiagramNode(tn: TypeNode | undefined): boolean {
  const diagram = resolveAlias(tn) ?? tn;
  const kind = qualifierOf(diagram);
  return (
    lastName(diagram) === "Diagram" && kind !== undefined && kind in diagrams
  );
}

function renderDiagram(diagramNode: TypeNode): string {
  // A named alias (e.g. a body shared across themed diagrams) resolves to the
  // Diagram it points at.
  const diagram = resolveAlias(diagramNode) ?? diagramNode;
  const kind = qualifierOf(diagram);
  const render =
    kind && kind in diagrams
      ? diagrams[kind as keyof typeof diagrams].render
      : undefined;
  if (lastName(diagram) !== "Diagram" || !render)
    fail(`unknown diagram kind \`${kind ?? diagram.getText()}\``, diagramNode);
  return renderOptions(diagram) + render(diagram);
}

/**
 * A diagram's render-options prefix. Options are supplied as an `Options<[...]>`
 * type argument, located by key among the diagram's arguments rather than by
 * position, so it doesn't matter how many content arguments precede them.
 */
function renderOptions(diagram: TypeNode): string {
  const marker = argsOf(diagram).find((arg) => lastName(arg) === "Options");
  const options = marker ? argsOf(marker)[0] : undefined;
  if (!options) return "";
  for (const opt of tupleOf(options)) {
    if (lastName(opt) === "Theme") {
      const theme = strOf(argsOf(opt)[0]) ?? "default";
      return `%%{init: {'theme':'${theme}'}}%%\n`;
    }
  }
  return "";
}
