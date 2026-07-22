import type { Flowchart } from "../../release/diagrams/flowchart.js";

type A = { id: string };
type B = { name: string };
type C = A & B;

export type ResolvedIntersection = Flowchart.Diagram<"leftright", C>;
