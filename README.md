# Typescript2mermaid Suede

This repo is a [suede dependency](https://github.com/pmalacho-mit/suede).

To see the installable source code, please checkout the [release branch](https://github.com/pmalacho-mit/typescript2mermaid-suede/tree/release).

## Installation

```bash
bash <(curl https://suede.sh/install/release) --repo pmalacho-mit/typescript2mermaid-suede
```

<details>
<summary>
See alternative to using <a href="https://github.com/pmalacho-mit/suede#suedesh">suede.sh</a> script proxy
</summary>

```bash
bash <(curl https://raw.githubusercontent.com/pmalacho-mit/suede/refs/heads/main/scripts/install/release.sh) --repo pmalacho-mit/typescript2mermaid-suede
```

</details>

Author GitHub-compatible [Mermaid](https://mermaid.js.org) diagrams as **TypeScript types**, then generate them with the TypeScript compiler.

```ts
import type { Render, Flowchart } from "typescript2mermaid";

type A = {};
type B = {};
type C = {};
type D = {};

type Example = Render<
  Flowchart.Diagram<
    "topdown",
    [
      Flowchart.Connect<A, B>,
      Flowchart.Connect<A, C>,
      Flowchart.Connect<B, D>,
      Flowchart.Connect<C, D>,
    ]
  >
>;
```

```
$ typescript2mermaid example.ts
```

````
### Example

```mermaid
flowchart TD
    A --> B
    A --> C
    B --> D
    C --> D
```
````

Because the generator runs the real TypeScript type checker (via [ts-morph](https://ts-morph.com)), diagrams are **type-checked** — referencing an undefined node is a compile error, renames propagate through your editor — and node types are **fully resolved** into the output, so diagrams stand alone:

```ts
type A = { id: string };
type B = { name: string };
type C = A & B;

type Resolved = Render<Flowchart.Diagram<"leftright", C>>;
```

```
flowchart LR
    C["C<br/>id: string<br/>name: string"]
```

The intersection is flattened by the checker; the node carries its complete shape. What "fully resolved" means adapts per diagram: flowchart nodes render their members inline in the label, class diagrams expand types into complete `class` bodies (including members inherited through intersections), and ER entities emit full attribute lists with key markers.

## Usage

```
typescript2mermaid <files...> [-o output.md] [--project tsconfig.json]
```

Every `type X = Render<...>` alias found in the given files is emitted as a `### X` heading plus a fenced ` ```mermaid ` block. Without `-o`, markdown goes to stdout. There is also a programmatic API: `generateFromFiles`, `generateFromSource`, `generateFromSourceFile`.

## Supported diagrams

All eight diagram families from the GitHub-supported Mermaid set. Each family lives in its own namespace whose `Diagram` type is the root, and whose `Statement` union constrains what its body accepts — **the type constraints are the documentation**: an invalid statement, direction, cardinality, or score is a compile error. See `examples/` for a DSL rendition of every example in [this Mermaid fundamentals tutorial](https://gist.github.com/GingerGraham/66a1e586fe2addbc6375b1fba1d2818c); all generated output parses cleanly against the Mermaid parser (`node validate.mjs examples/output.md`).

```ts
type Render<D extends AnyDiagram, Options extends readonly RenderOption[] = []>
```

`AnyDiagram` is the union of all `<Family>.Diagram` types. Options: `[Theme<"dark">]` emits an `%%{init}%%` directive (`default`, `dark`, `forest`, `neutral`).

### Flowchart

```ts
Flowchart.Diagram<Direction, Body extends AnyNode | readonly Flowchart.Statement[]>
```

`Flowchart.Direction`: `"topdown" | "bottomup" | "leftright" | "rightleft"`. Body is a single node type or a tuple of statements:

| Statement                                                                            | Renders                                                                                                                                                               |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Flowchart.Connect<A, B>`                                                            | `A --> B`                                                                                                                                                             |
| `Flowchart.Connect<A, B, "Yes">`                                                     | `A -->\|Yes\| B`                                                                                                                                                      |
| `Flowchart.Connect<A, B, never, "dotted">`                                           | `A -.-> B` (`Flowchart.EdgeStyle`: `arrow`, `line`, `dotted`, `thick`, `circle`, `cross`)                                                                             |
| `Flowchart.Node<A, "diamond">`                                                       | `A{...}` (`Flowchart.Shape`: `rectangle`, `rounded`, `stadium`, `subroutine`, `database`, `circle`, `diamond`, `hexagon`, `parallelogram`, `parallelogram-alternate`) |
| `Flowchart.Node<A, "rectangle", "Custom label">`                                     | custom label, suppresses type expansion                                                                                                                               |
| `Flowchart.Node<A, "rectangle", false>`                                              | bare name, suppresses type expansion                                                                                                                                  |
| `Flowchart.Subgraph<"Title", [A, Flowchart.Connect<A, B>]>`                          | `subgraph` block (members may be nodes or nested statements)                                                                                                          |
| `Flowchart.Style<A, "fill:#f9f">`                                                    | `style A fill:#f9f`                                                                                                                                                   |
| `Flowchart.DefineClass<"name", "fill:...">` / `Flowchart.ApplyClass<[A, B], "name">` | `classDef` / `class A,B name`                                                                                                                                         |

Node labels: if a node's resolved type has members and no explicit label, the label is `Name<br/>member: type<br/>...` (GitHub renders `<br/>` inside quoted labels).

### Sequence

```ts
Render<Sequence.Diagram<[
  Sequence.Participant<User, "User">,                  // or Sequence.Actor<...>
  Sequence.Message<User, API, "Login", "activate">,    // ->> (opens activation box on target)
  Sequence.Reply<API, User, "OK", "deactivate">,       // -->> (closes source's activation box)
  Sequence.Lost<User, API, "oops">,                    // -x
  Sequence.Async<User, API, "fire and forget">,        // -)
  Sequence.NoteOver<[User, API], "Auth flow">,         // also NoteRight<T, "...">, NoteLeft
  Sequence.Loop<"Every 30s", [...]>,                   // also Optional<...>, Alternative<label, body, elseLabel, elseBody>
]>>
```

Loop/Optional/Alternative bodies are themselves `readonly Sequence.Statement[]`, so nesting stays fully checked.

### Class diagram

```ts
type Animal = { name: string; makeSound(): void };
type Dog = Animal & { bark(): void };

Render<
  ClassDiagram.Diagram<
    [
      ClassDiagram.Extends<Dog, Animal>, // Animal <|-- Dog
      ClassDiagram.Composition<Whole, Part>, // *--   Aggregation<...> o--
      ClassDiagram.Association<Owner, Animal, "owns">, // -->   Link<...> --
      ClassDiagram.DependsOn<A, B>, // ..>   Realizes ..|>   Implements --|>
      ClassDiagram.Class<Orphan>, // include a class with no relations
    ]
  >
>;
```

Every referenced type expands into a full `class` body from its _resolved_ type — `Dog` lists `name`, `makeSound()`, and `bark()`. Function-typed members render as methods with parameters and return types. Visibility uses identity marker types on members: `ClassDiagram.Private<T>` (`-`), `ClassDiagram.Protected<T>` (`#`), `ClassDiagram.Internal<T>` (`~`); default is `+`.

### State diagram

```ts
Render<State.Diagram<[
  State.Transition<State.Start, Idle>,      // [*] --> Idle
  State.Transition<Idle, Processing, "start">,
  State.Transition<Success, State.End>,     // Success --> [*]
  State.Composite<Active, [State.Transition<State.Start, Running>, ...]>,
  State.Note<Locked, "right", "Locked after 3 attempts">,
]>>
```

`State.Start` and `State.End` are pseudo-state markers rendering as `[*]`.

### Entity relationship diagram

```ts
type USER = {
  user_id: Entity.Key.Primary<Entity.Integer>;
  username: Entity.Key.Unique<Entity.Text>;
  created_at: Entity.DateTime;
};

Render<
  Entity.Diagram<
    [
      Entity.Relation<USER, ORDER, "one-to-zero-or-many", "places">,
      Entity.Include<STANDALONE>,
    ]
  >
>;
```

`Entity.Cardinality`: `one-to-one` (`||--||`), `one-to-many` (`||--|{`), `one-to-zero-or-many` (`||--o{`), `zero-or-one-to-many` (`|o--|{`), `many-to-one` (`}|--||`), `many-to-many` (`}|--|{`). Attributes come from the resolved entity type; `Entity.Key.Primary`/`Entity.Key.Foreign`/`Entity.Key.Unique` are identity markers detected on each property, rendered as `PK`/`FK`/`UK`. SQL-ish aliases `Entity.Integer`, `Entity.Decimal`, `Entity.Text`, `Entity.DateTime`, `Entity.Boolean` render as `int`, `decimal`, `text`, `datetime`, `boolean` (plain `string`/`number`/`boolean`/`Date` also map sensibly).

### Journey, Pie, Gantt

```ts
Render<
  Journey.Diagram<
    "Title",
    [
      Journey.Section<
        "Discovery",
        [
          Journey.Task<"Visit homepage", 5, [User, "QA Engineer"]>, // scores: Journey.Satisfaction = 1-5
        ]
      >,
    ]
  >
>;

Render<Pie.Diagram<"Costs", [Pie.Slice<"EC2", 45>, Pie.Slice<"RDS", 25>]>>;
// or derive slices from a type's numeric-literal properties:
type Costs = { "EC2 Instances": 45; "RDS Database": 25 };
Render<Pie.Diagram<"Costs", Costs>>;

Render<
  Gantt.Diagram<
    "Title",
    "YYYY-MM-DD",
    [
      Gantt.Section<
        "Planning",
        [
          Gantt.Task<"Requirements", "req", "2024-01-01", "2024-01-15", "done">,
          Gantt.Task<"Design", "design", Gantt.After<"req">, "10d">, // Gantt.Status: done | active | crit
        ]
      >,
    ]
  >
>;
```

Journey task actors may be type references or string literals (for names with spaces). Namespace imports may be aliased (`import type { Flowchart as F }`); the generator resolves the alias through the symbol table.

## VSCode integration

The `vscode-extension/` directory contains a companion extension: hovering a `Render<...>` alias shows the generated Mermaid source inline, with a code lens / hover link that opens the fully rendered diagram in a side panel (Mermaid bundled locally, theme-aware). See `vscode-extension/README.md` for build-and-run steps. The extension is a thin client over the library's `GeneratorSession` API — a long-lived project that accepts unsaved buffer text, which other editor integrations can reuse.

## How it works

The generator never executes your code. It loads files into a ts-morph `Project`, finds type aliases whose type node is a `Diagram<...>` reference, and walks the type-argument _syntax_ to read the DSL structure (string/number literals, tuples, references). Wherever a user type is referenced as a node/class/entity, it asks the type checker for the fully resolved type behind it and flattens its members. Markers like `Private<T>` and `PK<T>` are declared as identity types (`type PK<T> = T`) so the checker sees clean types, while the generator recovers the markers syntactically from each property's original declaration — which is why they survive through intersections and other type-level composition.

## Limitations

- Node identity is the referenced type's name; two types with the same name from different scopes collide.
- Deeply generic or recursive member types render as their declared text, which can produce labels Mermaid dislikes (e.g. `|` in unions inside class bodies). Use `Node<T, shape, "label">` or simpler facade types where needed.
- Mermaid feature support varies by renderer version; everything here targets what GitHub renders as of 2026.
