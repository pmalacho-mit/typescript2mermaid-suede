import type { Flowchart } from "../../release/flowchart.js";

type A = {};
type B = {};
type C = {};

export type BasicFlow = Flowchart.Diagram<
  "topdown",
  [Flowchart.Connect<A, B>, Flowchart.Connect<B, C>]
>;
