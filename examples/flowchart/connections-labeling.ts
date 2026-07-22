import type { Flowchart } from "../../release/flowchart.js";

type A = {};
type B = {};
type C = {};
type D = {};
type E = {};
type F = {};
type G = {};

export type LabeledEdges = Flowchart.Diagram<
  "topdown",
  [
    Flowchart.Connect<A, B, "Yes">,
    Flowchart.Connect<A, C, "No">,
    Flowchart.Connect<D, E, "maybe", "dotted">,
    Flowchart.Connect<F, G, "always", "thick">,
  ]
>;
