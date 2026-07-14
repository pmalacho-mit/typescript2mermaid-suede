import type { Render, Flowchart } from "../../release/dsl.js";

type A = { id: string };
type B = { name: string };
type C = A & B;

export type ResolvedIntersection = Render<Flowchart.Diagram<"leftright", C>>;
