/**
 * typescript2mermaid DSL
 *
 * Phantom types for authoring GitHub-compatible Mermaid diagrams at the type
 * level. None of these types carry runtime values; the generator reads the
 * *syntax* of your type aliases (via ts-morph) and uses the TypeScript type
 * checker to fully resolve any referenced types into the rendered output.
 *
 * Each diagram family lives in its own namespace, and the type constraints
 * double as documentation: a diagram's `Body` only accepts that family's
 * `Statement` union, so invalid diagrams fail to compile.
 *
 *   import type { Render, Flowchart } from "typescript2mermaid";
 *
 *   type Example = Render<Flowchart.Diagram<"topdown", [
 *     Flowchart.Connect<A, B>,
 *   ]>>;
 */

/** Any diagram family's root type — the only valid first argument to `Render`. */
export type AnyDiagram =
  | Flowchart.Diagram<any, any>
  | Sequence.Diagram<any>
  | ClassDiagram.Diagram<any>
  | State.Diagram<any>
  | Entity.Diagram<any>
  | Journey.Diagram<any, any>
  | Pie.Diagram<any, any>
  | Gantt.Diagram<any, any, any>;

/** Sets a Mermaid `%%{init}%%` theme directive on the rendered diagram. */
export type Theme<T extends "default" | "dark" | "forest" | "neutral"> = {
  readonly __theme: T;
};

/** Options accepted by `Render`. */
export type RenderOption = Theme<any>;

/**
 * Root marker. Every diagram is declared as
 * `type X = Render<SomeFamily.Diagram<...>, Options?>`.
 */
export type Render<
  D extends AnyDiagram,
  Options extends readonly RenderOption[] = [],
> = { readonly __render: D; readonly __options: Options };

/**
 * A node in a diagram: any of your own object types. Referenced types are
 * fully resolved by the type checker at generation time. (The `length`
 * exclusion only exists to keep statement tuples from matching here.)
 */
export type AnyNode = object & { readonly length?: never };

export namespace Flowchart {
  export type Direction = "topdown" | "bottomup" | "leftright" | "rightleft";

  export type EdgeStyle =
    | "arrow"
    | "line"
    | "dotted"
    | "thick"
    | "circle"
    | "cross";

  export type Shape =
    | "rectangle"
    | "rounded"
    | "stadium"
    | "subroutine"
    | "database"
    | "circle"
    | "diamond"
    | "hexagon"
    | "parallelogram"
    | "parallelogram-alternate";

  /** Everything that may appear in a flowchart body. */
  export type Statement =
    | Connect<any, any, any, any>
    | Node<any, any, any>
    | Subgraph<any, any>
    | Style<any, any>
    | DefineClass<any, any>
    | ApplyClass<any, any>;

  /**
   * Body is a single node type, a single statement, or a tuple of statements.
   * Nodes whose resolved type has members render them into the node label
   * (`C["C<br/>id: string<br/>name: string"]`) unless a `Node<>` declaration
   * overrides the label.
   */
  export type Diagram<
    Dir extends Direction,
    Body extends AnyNode | readonly Statement[],
  > = { readonly __flow: [Dir, Body] };

  /** An edge: `Connect<A, B>`, `Connect<A, B, "Yes">`, `Connect<A, B, "maybe", "dotted">`. */
  export type Connect<
    From,
    To,
    Label extends string = never,
    Style extends EdgeStyle = "arrow",
  > = { readonly __edge: [From, To, Label, Style] };

  /**
   * Declares a node's shape and/or label.
   * Label semantics: omitted → the node renders its fully-resolved type;
   * a string → custom label (no type expansion); `false` → bare name only.
   */
  export type Node<
    T,
    S extends Shape = "rectangle",
    Label extends string | false = never,
  > = { readonly __node: [T, S, Label] };

  /** `Subgraph<"Title", [A, Connect<A, B>]>` — members may be nodes or nested statements. */
  export type Subgraph<
    Title extends string,
    Members extends readonly (Statement | AnyNode)[],
  > = { readonly __subgraph: [Title, Members] };

  /** `Style<A, "fill:#f9f,stroke:#333,stroke-width:4px">` */
  export type Style<T, Css extends string> = { readonly __style: [T, Css] };

  /** Defines a reusable style class: `DefineClass<"devClass", "fill:#e3f2fd,stroke-width:2px">`. */
  export type DefineClass<Name extends string, Css extends string> = {
    readonly __classdef: [Name, Css];
  };

  /** Applies a defined style class to nodes: `ApplyClass<[A, B], "devClass">`. */
  export type ApplyClass<
    Targets extends readonly AnyNode[],
    Name extends string,
  > = { readonly __useclass: [Targets, Name] };
}

export namespace Sequence {
  /** `"activate"` opens an activation box on the target; `"deactivate"` closes the source's. */
  export type Activation = "activate" | "deactivate";

  /** Everything that may appear in a sequence body. */
  export type Statement =
    | Participant<any, any>
    | Actor<any, any>
    | Message<any, any, any, any>
    | Reply<any, any, any, any>
    | Lost<any, any, any>
    | Async<any, any, any>
    | NoteOver<any, any>
    | NoteRight<any, any>
    | NoteLeft<any, any>
    | Loop<any, any>
    | Optional<any, any>
    | Alternative<any, any, any, any>;

  export type Diagram<Body extends readonly Statement[]> = {
    readonly __seq: Body;
  };

  export type Participant<T, Alias extends string = never> = {
    readonly __participant: [T, Alias];
  };
  export type Actor<T, Alias extends string = never> = {
    readonly __actor: [T, Alias];
  };

  /** Solid arrow `->>` (synchronous message). */
  export type Message<
    From,
    To,
    Text extends string,
    A extends Activation = never,
  > = { readonly __msg: [From, To, Text, A] };
  /** Dashed arrow `-->>`. */
  export type Reply<
    From,
    To,
    Text extends string,
    A extends Activation = never,
  > = { readonly __reply: [From, To, Text, A] };
  /** Cross ending `-x` (lost message). */
  export type Lost<From, To, Text extends string> = {
    readonly __lost: [From, To, Text];
  };
  /** Open arrow `-)` (async). */
  export type Async<From, To, Text extends string> = {
    readonly __async: [From, To, Text];
  };

  export type NoteOver<
    Targets extends readonly AnyNode[],
    Text extends string,
  > = { readonly __noteover: [Targets, Text] };
  export type NoteRight<T, Text extends string> = {
    readonly __noteright: [T, Text];
  };
  export type NoteLeft<T, Text extends string> = {
    readonly __noteleft: [T, Text];
  };

  export type Loop<Label extends string, Body extends readonly Statement[]> = {
    readonly __loop: [Label, Body];
  };
  export type Optional<
    Label extends string,
    Body extends readonly Statement[],
  > = { readonly __opt: [Label, Body] };
  export type Alternative<
    Label extends string,
    Body extends readonly Statement[],
    ElseLabel extends string = never,
    ElseBody extends readonly Statement[] = never,
  > = { readonly __alt: [Label, Body, ElseLabel, ElseBody] };
}

export namespace ClassDiagram {
  /** Everything that may appear in a class-diagram body. */
  export type Statement =
    | Class<any, any>
    | Extends<any, any>
    | Composition<any, any, any>
    | Aggregation<any, any, any>
    | Association<any, any, any>
    | Link<any, any, any>
    | DependsOn<any, any, any>
    | Realizes<any, any>
    | Implements<any, any>;

  /**
   * Every referenced type expands into a full `class` body from its
   * *resolved* type: fields, methods (function-typed members), and
   * visibility markers all survive intersections and other composition.
   */
  export type Diagram<Body extends readonly Statement[]> = {
    readonly __class: Body;
  };

  /** Explicitly include a type as a class (relationships auto-include theirs). */
  export type Class<T, Name extends string = never> = {
    readonly __clsinclude: [T, Name];
  };

  /** `Extends<Dog, Animal>` → `Animal <|-- Dog` */
  export type Extends<Child, Parent> = { readonly __extends: [Child, Parent] };
  /** `Composition<Whole, Part>` → `Whole *-- Part` */
  export type Composition<Whole, Part, Label extends string = never> = {
    readonly __composition: [Whole, Part, Label];
  };
  /** `Aggregation<Whole, Part>` → `Whole o-- Part` */
  export type Aggregation<Whole, Part, Label extends string = never> = {
    readonly __aggregation: [Whole, Part, Label];
  };
  /** `Association<Owner, Animal, "owns">` → `Owner --> Animal : owns` */
  export type Association<From, To, Label extends string = never> = {
    readonly __association: [From, To, Label];
  };
  /** `Link<A, B>` → `A -- B` */
  export type Link<A, B, Label extends string = never> = {
    readonly __link: [A, B, Label];
  };
  /** `DependsOn<A, B>` → `A ..> B` */
  export type DependsOn<From, To, Label extends string = never> = {
    readonly __dependson: [From, To, Label];
  };
  /** `Realizes<A, B>` → `A ..|> B` */
  export type Realizes<From, To> = { readonly __realizes: [From, To] };
  /** `Implements<A, B>` → `A --|> B` */
  export type Implements<From, To> = { readonly __implements: [From, To] };

  /* Visibility markers for class members (identity types; the generator
     detects them syntactically on each property's declaration). */

  /** Member renders with `-`. */
  export type Private<T> = T;
  /** Member renders with `#`. */
  export type Protected<T> = T;
  /** Member renders with `~`. */
  export type Internal<T> = T;
}

export namespace State {
  /** The `[*]` start pseudo-state. */
  export interface Start {
    readonly __start: true;
  }
  /** The `[*]` end pseudo-state. */
  export interface End {
    readonly __end: true;
  }

  /** Everything that may appear in a state-diagram body. */
  export type Statement =
    | Transition<any, any, any>
    | Composite<any, any>
    | Note<any, any, any>;

  export type Diagram<Body extends readonly Statement[]> = {
    readonly __state: Body;
  };

  /** `Transition<Idle, Processing, "start">` — use `Start`/`End` for `[*]`. */
  export type Transition<From, To, Label extends string = never> = {
    readonly __transition: [From, To, Label];
  };

  /** `Composite<Active, [Transition<Start, Running>, ...]>` — a nested state machine. */
  export type Composite<T, Body extends readonly Statement[]> = {
    readonly __composite: [T, Body];
  };

  /** `Note<Locked, "right", "Account locked after 3 failed attempts">` */
  export type Note<T, Side extends "right" | "left", Text extends string> = {
    readonly __statenote: [T, Side, Text];
  };
}

export namespace Entity {
  export type Cardinality =
    | "one-to-one" // ||--||
    | "one-to-many" // ||--|{
    | "one-to-zero-or-many" // ||--o{
    | "zero-or-one-to-many" // |o--|{
    | "many-to-one" // }|--||
    | "many-to-many"; // }|--|{

  /** Everything that may appear in an entity-relationship body. */
  export type Statement = Relation<any, any, any, any> | Include<any>;

  /**
   * Entity attribute lists come straight from the resolved types;
   * `Key.Primary` / `Key.Foreign` / `Key.Unique` are identity wrappers
   * detected on each property's declaration.
   */
  export type Diagram<Body extends readonly Statement[]> = {
    readonly __er: Body;
  };

  /** `Relation<USER, ORDER, "one-to-zero-or-many", "places">` */
  export type Relation<A, B, Card extends Cardinality, Label extends string> = {
    readonly __relation: [A, B, Card, Label];
  };

  /** Include an entity that has no relations. */
  export type Include<T> = { readonly __entity: [T] };

  /**
   * Attribute key markers (identity types; detected syntactically):
   *
   *   type USER = {
   *     user_id: Entity.Key.Primary<Entity.Integer>;
   *     username: Entity.Key.Unique<Entity.Text>;
   *   };
   */
  export namespace Key {
    /** Renders the `PK` marker. */
    export type Primary<T> = T;
    /** Renders the `FK` marker. */
    export type Foreign<T> = T;
    /** Renders the `UK` marker. */
    export type Unique<T> = T;
  }

  /* SQL-ish primitive aliases; rendered lowercased in attribute lists. */
  export type Integer = number;
  export type Decimal = number;
  export type Text = string;
  export type DateTime = string;
  export type Boolean = boolean;
}

export namespace Journey {
  /** Task scores are the 1–5 satisfaction scale Mermaid journeys use. */
  export type Satisfaction = 1 | 2 | 3 | 4 | 5;

  export type Diagram<
    Title extends string,
    Body extends readonly Section<any, any>[],
  > = { readonly __journey: [Title, Body] };

  export type Section<
    Name extends string,
    Tasks extends readonly Task<any, any, any>[],
  > = { readonly __jsection: [Name, Tasks] };

  /**
   * `Task<"Visit homepage", 5, [User]>` — actors are type references or
   * string literals (for names with spaces).
   */
  export type Task<
    Desc extends string,
    Score extends Satisfaction,
    Actors extends readonly (AnyNode | string)[],
  > = { readonly __jtask: [Desc, Score, Actors] };
}

export namespace Pie {
  /**
   * Body is either a tuple of `Slice<...>` entries or an object type whose
   * numeric-literal properties become slices:
   *
   *   type Usage = { CPU: 35; Memory: 25 };
   *   type Chart = Render<Pie.Diagram<"Resource Usage", Usage>>;
   */
  export type Diagram<
    Title extends string,
    Body extends readonly Slice<any, any>[] | Record<string, number>,
  > = { readonly __pie: [Title, Body] };

  export type Slice<Label extends string, Value extends number> = {
    readonly __slice: [Label, Value];
  };
}

export namespace Gantt {
  export type Status = "done" | "active" | "crit";

  export type Diagram<
    Title extends string,
    DateFormat extends string,
    Body extends readonly Section<any, any>[],
  > = { readonly __gantt: [Title, DateFormat, Body] };

  export type Section<
    Name extends string,
    Tasks extends readonly Task<any, any, any, any, any>[],
  > = { readonly __gsection: [Name, Tasks] };

  /**
   * `Task<"Requirements Analysis", "req", "2024-01-01", "2024-01-15", "done">`
   * `Task<"System Design", "design", After<"req">, "10d", "done">`
   */
  export type Task<
    Desc extends string,
    Id extends string,
    Begin extends string | After<string>,
    Finish extends string,
    S extends Status = never,
  > = { readonly __gtask: [Desc, Id, Begin, Finish, S] };

  /** Dependency start: `After<"req">` → `after req`. */
  export type After<Id extends string> = { readonly __after: Id };
}
