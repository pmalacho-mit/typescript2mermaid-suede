import { indent, type Render } from "./common.js";
import type { TypeNode } from "ts-morph";
import {
  argsOf,
  fail,
  lastName,
  numOf,
  numericLiteralProps,
  strOf,
  tupleOf,
} from "./parse.js";

export namespace Pie {
  /**
   * Body is either a tuple of `Slice<...>` entries or an object type whose
   * numeric-literal properties become slices:
   *
   *   type Usage = { CPU: 35; Memory: 25 };
   *   type Chart = Pie.Diagram<"Resource Usage", Usage>;
   */
  export type Diagram<
    Title extends string,
    Body extends readonly Slice<any, any>[] | Record<string, number>,
    Opts extends Render.Options<any> = Render.Options,
  > = { readonly __pie: [Title, Body, Opts] };

  export type Slice<Label extends string, Value extends number> = {
    readonly __slice: [Label, Value];
  };
}

/** Statement kind → its DSL type, so dispatch labels are checked against the DSL. */
type Statements = {
  Slice: Pie.Slice<any, any>;
};

export const render = (body: TypeNode): string => {
  const [title, data] = argsOf(body);
  const lines: string[] = [`pie title ${strOf(title) ?? ""}`];

  const entries = tupleOf(data);
  const isSlices =
    entries.length > 0 &&
    entries.every((e) => lastName(e) === ("Slice" satisfies keyof Statements));
  if (isSlices) {
    for (const slice of entries) {
      const [label, value] = argsOf(slice);
      lines.push(indent(1)`"${strOf(label) ?? ""}" : ${numOf(value) ?? 0}`);
    }
  } else if (data) {
    // Object-type body: numeric-literal properties become slices.
    const props = numericLiteralProps(data);
    if (props.length === 0)
      fail(
        "Pie body must be Slice<> entries or a type with numeric-literal properties",
        data,
      );
    for (const prop of props)
      lines.push(indent(1)`"${prop.name}" : ${prop.value}`);
  }
  return lines.join("\n");
};
