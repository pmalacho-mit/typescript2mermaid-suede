import type { Flowchart, Render } from "../../release";

type A = {};
type B = {};
type C = {};

// A reusable body shared across the themed variants below.
type Body = [Flowchart.Connect<A, B>, Flowchart.Connect<B, C>];

export type Default = Flowchart.Diagram<"topdown", Body>;

export type DefaultExplicit = Flowchart.Diagram<
  "topdown",
  Body,
  Render.Options<[Render.Theme<"default">]>
>;

export type Dark = Flowchart.Diagram<
  "topdown",
  Body,
  Render.Options<[Render.Theme<"dark">]>
>;

export type Forest = Flowchart.Diagram<
  "topdown",
  Body,
  Render.Options<[Render.Theme<"forest">]>
>;

export type Neutral = Flowchart.Diagram<
  "topdown",
  Body,
  Render.Options<[Render.Theme<"neutral">]>
>;
