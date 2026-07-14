import type { Render, Flowchart } from "../../release/dsl.js";

type NodeA = {};
type NodeB = {};

export type DirectStyles = Render<
  Flowchart.Diagram<
    "topdown",
    [
      Flowchart.Connect<NodeA, NodeB>,
      Flowchart.Style<NodeA, "fill:#f9f,stroke:#333,stroke-width:4px">,
      Flowchart.Style<
        NodeB,
        "fill:#bbf,stroke:#f66,stroke-width:2px,color:#fff"
      >,
    ]
  >
>;
