/**
 * A node in a diagram: any of your own object types. Referenced types are
 * fully resolved by the type checker at generation time. (The `length`
 * exclusion only exists to keep statement tuples from matching here.)
 */
export type AnyNode = object & { readonly length?: never };

export namespace Render {
  /** Sets a Mermaid `%%{init}%%` theme directive on the rendered diagram. */
  export type Theme<T extends "default" | "dark" | "forest" | "neutral"> = {
    readonly __theme: T;
  };

  /** A single render option. */
  export type Option = Theme<any>;

  /**
   * A diagram's optional final type argument. The `__options` key lets the
   * generator retrieve options by name, independent of how many content
   * arguments a given family's Diagram takes before them:
   *
   *   Flowchart.Diagram<"topdown", [...], Options<[Theme<"dark">]>>
   */
  export type Options<O extends Option[] = []> = {
    readonly __options: O;
  };
}

export const indent =
  (level: number, amount = 4) =>
  (strings: TemplateStringsArray, ...values: unknown[]) =>
    " ".repeat(amount).repeat(level) + String.raw({ raw: strings }, ...values);
