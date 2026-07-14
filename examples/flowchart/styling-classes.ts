import type { Render, Flowchart } from "../../release/dsl.js";

type Development = {};
type Testing = {};
type Staging = {};
type Production = {};

export type ColoredPipeline = Render<Flowchart.Diagram<"topdown", [
  Flowchart.Connect<Development, Testing>,
  Flowchart.Connect<Testing, Staging>,
  Flowchart.Connect<Staging, Production>,
  Flowchart.DefineClass<"devClass", "fill:#e3f2fd,stroke:#1976d2,stroke-width:2px">,
  Flowchart.DefineClass<"testClass", "fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px">,
  Flowchart.DefineClass<"prodClass", "fill:#e8f5e8,stroke:#388e3c,stroke-width:2px">,
  Flowchart.ApplyClass<[Development], "devClass">,
  Flowchart.ApplyClass<[Testing, Staging], "testClass">,
  Flowchart.ApplyClass<[Production], "prodClass">,
]>>;