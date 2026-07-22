import type { Journey } from "../../release/journey.js";

type ProductManager = {};
type Developer = {};
type DevOps = {};

export type DevelopmentLifecycle = Journey.Diagram<
  "Software Development Lifecycle",
  [
    Journey.Section<
      "Planning",
      [
        Journey.Task<"Define requirements", 3, ["Product Manager", Developer]>,
        Journey.Task<"Create user stories", 4, [ProductManager]>,
        Journey.Task<"Estimate effort", 2, [Developer, "Tech Lead"]>,
      ]
    >,
    Journey.Section<
      "Development",
      [
        Journey.Task<"Write code", 5, [Developer]>,
        Journey.Task<"Code review", 3, ["Tech Lead", Developer]>,
        Journey.Task<"Run tests", 4, [Developer]>,
      ]
    >,
    Journey.Section<
      "Deployment",
      [
        Journey.Task<"Deploy to staging", 3, [DevOps, Developer]>,
        Journey.Task<"QA testing", 2, ["QA Engineer"]>,
        Journey.Task<"Deploy to production", 4, [DevOps]>,
      ]
    >,
  ]
>;
