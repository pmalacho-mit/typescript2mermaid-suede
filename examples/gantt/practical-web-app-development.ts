import type { Render, Gantt } from "../../release/dsl.js";

export type WebAppGantt = Render<
  Gantt.Diagram<
    "Web Application Development",
    "YYYY-MM-DD",
    [
      Gantt.Section<
        "Planning",
        [
          Gantt.Task<
            "Requirements Analysis",
            "req",
            "2024-01-01",
            "2024-01-15",
            "done"
          >,
          Gantt.Task<
            "System Design",
            "design",
            Gantt.After<"req">,
            "10d",
            "done"
          >,
        ]
      >,
      Gantt.Section<
        "Development",
        [
          Gantt.Task<
            "Database Setup",
            "db",
            "2024-01-20",
            "2024-01-25",
            "active"
          >,
          Gantt.Task<"Backend API", "api", Gantt.After<"db">, "20d">,
          Gantt.Task<"Frontend Development", "ui", Gantt.After<"db">, "25d">,
        ]
      >,
      Gantt.Section<
        "Testing",
        [
          Gantt.Task<"Unit Testing", "test1", Gantt.After<"api">, "5d">,
          Gantt.Task<"Integration Testing", "test2", Gantt.After<"ui">, "10d">,
        ]
      >,
      Gantt.Section<
        "Deployment",
        [
          Gantt.Task<"Staging Deployment", "stage", Gantt.After<"test2">, "3d">,
          Gantt.Task<
            "Production Deployment",
            "prod",
            Gantt.After<"stage">,
            "2d"
          >,
        ]
      >,
    ]
  >
>;
