import { DslSession } from "./typescript-dsl-suede/index.js";
import { analyzer } from "./render.js";

/**
 * A long-lived generation session for editor integrations.
 *
 * All of the machinery — keeping a ts-morph Project alive across calls, pushing
 * unsaved buffers in, walking the transitive import graph — is generic and lives
 * in `DslSession`. This only binds it to the Mermaid analyzer and re-shapes the
 * findings into the diagram record this package has always exposed.
 */
export class GeneratorSession extends DslSession<string> {
  constructor(tsConfigFilePath?: string) {
    super(analyzer, tsConfigFilePath);
  }

  /** Generate all diagrams declared in the given file. */
  generate(filePath: string) {
    return this.analyze(filePath).map(
      ({ label, id, range: { file }, data }) => ({
        name: label ?? id,
        file,
        code: data,
      }),
    );
  }
}
