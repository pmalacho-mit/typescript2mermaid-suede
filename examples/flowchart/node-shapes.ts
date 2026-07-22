import type { Flowchart } from "../../release/diagrams/flowchart.js";

type Rectangle = {};
type Rounded = {};
type Stadium = {};
type Subroutine = {};
type Database = {};
type Circle = {};
type Diamond = {};
type Hexagon = {};
type Parallelogram = {};
type AltParallelogram = {};

export type NodeShapes = Flowchart.Diagram<
  "leftright",
  [
    Flowchart.Node<Rectangle, "rectangle", "This is a rectangle">,
    Flowchart.Node<Rounded, "rounded", "This is a rounded">,
    Flowchart.Node<Stadium, "stadium", "This is a stadium">,
    Flowchart.Node<Subroutine, "subroutine", "This is a subroutine">,
    Flowchart.Node<Database, "database", "This is a database">,
    Flowchart.Node<Circle, "circle", "This is a circle">,
    Flowchart.Node<Diamond, "diamond", "This is a diamond">,
    Flowchart.Node<Hexagon, "hexagon", "This is a hexagon">,
    Flowchart.Node<Parallelogram, "parallelogram", "This is a parallelogram">,
    Flowchart.Node<
      AltParallelogram,
      "parallelogram-alternate",
      "This is an alt parallelogram"
    >,
  ]
>;
