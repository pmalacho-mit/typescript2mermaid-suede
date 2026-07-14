import type { Render, Flowchart } from "../../release/dsl.js";

type A = {};
type B = {};
type C = {};

export type BasicFlow = Render<Flowchart.Diagram<"topdown", [
  Flowchart.Connect<A, B>,
  Flowchart.Connect<B, C>,
]>>;