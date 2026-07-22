import { Project, type SourceFile } from "ts-morph";
import { generateFrom, type EmittedDiagram } from "./generate.js";

/**
 * A long-lived generation session for editor integrations.
 *
 * Keeps a ts-morph Project alive across calls so cross-file type resolution
 * works and repeated generations are cheap, while letting the editor push
 * unsaved buffer contents via `updateFile`.
 */
export class GeneratorSession {
  private readonly project: Project;

  constructor(tsConfigFilePath?: string) {
    this.project = new Project(
      tsConfigFilePath
        ? { tsConfigFilePath }
        : { compilerOptions: { strict: true } },
    );
  }

  /** Sync a file's contents (e.g. an unsaved editor buffer) into the project. */
  updateFile(filePath: string, text: string): void {
    const source = this.project.getSourceFile(filePath);
    if (source !== undefined && source.getFullText() !== text)
      source.replaceWithText(text);
    else this.project.createSourceFile(filePath, text, { overwrite: true });
  }

  /** Generate all diagrams declared in the given file. */
  generate(filePath: string): EmittedDiagram[] {
    return generateFrom.source(this.sourceFile(filePath));
  }

  /**
   * Every source file that can affect the diagrams in `filePath`: the file
   * itself plus everything it transitively imports or re-exports.
   *
   * A diagram's nodes are usually types declared in *other* modules — the
   * checker resolves them at generation time — so an editor watching only the
   * previewed file would miss edits that change the rendered output.
   */
  dependencies(filePath: string): string[] {
    const seen = new Set<string>();
    const queue = [this.sourceFile(filePath)];
    while (queue.length > 0) {
      const current = queue.pop()!;
      const path = current.getFilePath();
      if (seen.has(path)) continue;
      seen.add(path);
      // Module specifiers that resolve to a file in the project — covers
      // imports and re-export chains alike.
      for (const referenced of current.getReferencedSourceFiles())
        if (!seen.has(referenced.getFilePath())) queue.push(referenced);
    }
    return [...seen];
  }

  private sourceFile(filePath: string): SourceFile {
    return (
      this.project.getSourceFile(filePath) ??
      this.project.addSourceFileAtPath(filePath)
    );
  }
}
