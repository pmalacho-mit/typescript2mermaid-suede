import type { Pie } from "../../release/diagrams/pie.js";

export type ServerResources = Pie.Diagram<
  "Server Resource Usage",
  [
    Pie.Slice<"CPU", 35>,
    Pie.Slice<"Memory", 25>,
    Pie.Slice<"Storage", 30>,
    Pie.Slice<"Network", 10>,
  ]
>;
