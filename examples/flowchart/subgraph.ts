import type { Flowchart } from "../../release/flowchart.js";

type LocalDev = {};
type UnitTests = {};
type Build = {};
type IntegrationTests = {};
type LiveEnvironment = {};

export type SubgraphFlow = Flowchart.Diagram<
  "topdown",
  [
    Flowchart.Subgraph<
      "Development Environment",
      [Flowchart.Connect<LocalDev, UnitTests>]
    >,
    Flowchart.Subgraph<
      "CI/CD Pipeline",
      [Flowchart.Connect<Build, IntegrationTests>]
    >,
    Flowchart.Subgraph<"Production", [LiveEnvironment]>,
    Flowchart.Connect<UnitTests, Build>,
    Flowchart.Connect<IntegrationTests, LiveEnvironment>,
  ]
>;
