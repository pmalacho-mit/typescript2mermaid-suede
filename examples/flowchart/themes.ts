import type { Render, Flowchart, Theme } from "../../release/dsl.js";

type A = {};
type B = {};
type C = {};

type Flow = Flowchart.Diagram<"topdown", [
  Flowchart.Connect<A, B>,
  Flowchart.Connect<B, C>,
]>;

export type Default = Render<Flow>;

export type DefaultExplicit = Render<Flow, [Theme<"default">]>;

export type Dark = Render<Flow, [Theme<"dark">]>;

export type Forest = Render<Flow, [Theme<"forest">]>;

export type Neutral = Render<Flow, [Theme<"neutral">]>;