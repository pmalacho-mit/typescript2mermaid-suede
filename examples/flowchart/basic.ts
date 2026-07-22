import type { Flowchart } from "../../release/diagrams/flowchart.js";

type A = {};
type B = {};
type C = {};

export type BasicFlow = Flowchart.Diagram<
  "topdown",
  [Flowchart.Connect<A, B>, Flowchart.Connect<B, C>]
>;
