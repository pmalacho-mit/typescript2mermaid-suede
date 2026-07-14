import { Project } from "ts-morph";
import { generateFromSourceFile, type EmittedDiagram } from "./generate.js";

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
    this.project = tsConfigFilePath
      ? new Project({ tsConfigFilePath })
      : new Project({ compilerOptions: { strict: true } });
  }

  /** Sync a file's contents (e.g. an unsaved editor buffer) into the project. */
  updateFile(filePath: string, text: string): void {
    const sf = this.project.getSourceFile(filePath);
    if (sf) {
      if (sf.getFullText() !== text) sf.replaceWithText(text);
    } else {
      this.project.createSourceFile(filePath, text, { overwrite: true });
    }
  }

  /** Generate all diagrams declared in the given file. */
  generate(filePath: string): EmittedDiagram[] {
    const sf =
      this.project.getSourceFile(filePath) ?? this.project.addSourceFileAtPath(filePath);
    return generateFromSourceFile(sf);
  }
}
