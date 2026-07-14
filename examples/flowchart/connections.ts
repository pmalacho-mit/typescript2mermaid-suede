import type { Render, Flowchart } from "../../release/dsl.js";

type A = {};
type B = {};
type C = {};
type D = {};
type E = {};
type F = {};
type G = {};

export type EdgeStyles = Render<
  Flowchart.Diagram<
    "topdown",
    [
      Flowchart.Connect<A, B>,
      Flowchart.Connect<A, C, never, "line">,
      Flowchart.Connect<A, D, never, "dotted">,
      Flowchart.Connect<A, E, never, "thick">,
      Flowchart.Connect<A, F, never, "circle">,
      Flowchart.Connect<A, G, never, "cross">,
    ]
  >
>;
