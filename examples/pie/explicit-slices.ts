import type { Render, Pie } from "../../release/dsl.js";

export type ServerResources = Render<
  Pie.Diagram<
    "Server Resource Usage",
    [
      Pie.Slice<"CPU", 35>,
      Pie.Slice<"Memory", 25>,
      Pie.Slice<"Storage", 30>,
      Pie.Slice<"Network", 10>,
    ]
  >
>;
