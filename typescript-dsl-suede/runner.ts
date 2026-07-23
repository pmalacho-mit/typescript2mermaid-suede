/**
 * Front doors for an `Analyzer`: batch over files, run against a string, run
 * against an already-loaded file, or open a long-lived editor session.
 *
 * This is plumbing only. It adds no opinion about what a DSL looks like — it
 * just carries your analyzer to the three places it needs to run.
 */
import { Project, type ProjectOptions, type SourceFile } from "ts-morph";
import { passesGates, type Analyzer, type Finding } from "./analyze.js";
import { DslSession } from "./session.js";

export interface Runner<T> {
  /** The analyzer's cheap substring prefilter, for editors to reuse. */
  readonly gates: readonly string[];
  /** Run against an already-loaded file. */
  source(source: SourceFile): Finding<T>[];
  /** Run against files on disk, honouring a tsconfig when given. */
  files(paths: string[], tsConfigFilePath?: string): Finding<T>[];
  /** Run against a string in an in-memory filesystem — the testing front door. */
  code(text: string, fileName?: string): Finding<T>[];
  /** A long-lived session for editor integrations. */
  createSession(tsConfigFilePath?: string): DslSession<T>;
}

export function defineDsl<T>(
  analyzer: Analyzer<T>,
  {
    compilerOptions = { strict: true },
  }: { compilerOptions?: ProjectOptions["compilerOptions"] } = {},
): Runner<T> {
  const source = (file: SourceFile): Finding<T>[] =>
    passesGates(file.getFullText(), analyzer.gates)
      ? analyzer.analyze(file)
      : [];

  return {
    gates: analyzer.gates ?? [],
    source,
    files: (paths, tsConfigFilePath) => {
      const project = new Project(
        tsConfigFilePath ? { tsConfigFilePath } : { compilerOptions },
      );
      const files = paths.map((p) => project.addSourceFileAtPath(p));
      project.resolveSourceFileDependencies();
      return files.flatMap(source);
    },
    code: (text, fileName = "input.ts") =>
      source(
        new Project({
          compilerOptions,
          useInMemoryFileSystem: true,
        }).createSourceFile(fileName, text),
      ),
    createSession: (tsConfigFilePath) =>
      new DslSession(analyzer, tsConfigFilePath, compilerOptions),
  };
}
