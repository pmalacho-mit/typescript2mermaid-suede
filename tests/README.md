# Tests

```bash
npm test           # run once
npm run test:watch # re-run on change
npm run test:types # typecheck the suite (tsx strips types, it does not check them)
```

Raw `node:test` + `tsx`, no framework. Files mirror the module they cover, so
`tests/diagrams/flowchart.test.ts` tests `release/diagrams/flowchart.ts`.

| file | covers |
| --- | --- |
| `common.test.ts` | label escaping, and `safeMembers` decoding visibility/key markers, methods and intersections |
| `render.test.ts` | which declarations are found, family dispatch, theme options, alias indirection, error reporting |
| `identity.test.ts` | that a construct counts as ours only when it resolves into the library — shadow namespaces and unresolved imports are rejected |
| `session.test.ts` | `dsl.createSession()` (what the extension drives): unsaved buffers, the transitive import graph, findings with source ranges |
| `cli.test.ts` | the CLI end to end — embedding, idempotency, `--check`, co-located sources, name proximity, exit codes |
| `diagrams/*.test.ts` | one file per family: the statements it renders and the errors it raises |

`support.ts` holds the shared helpers and is not a test file:

- `render(source)` / `renderAll(source)` — render a snippet. A prelude importing
  every family is prepended, so a test only writes the declaration itself. The
  DSL matches constructs by *identity* — a reference is ours only when the
  checker resolves it into `release/` — so the prelude (and `imports(...)`)
  import the real library by absolute path, and `renderFrom.code` resolves them.
- `lines(code)` — rendered lines, trimmed, for order-and-content assertions.
- `typeNode(source, alias)` — a `TypeNode`, for helpers that take one directly.
- `workspace(t, files)` — a temp directory, removed when the test finishes.
- `runCli(args)` — spawn the real CLI. Its contract is argument handling, file
  writes and exit codes; none of that survives being unit-tested around.

The vendored `typescript-*-suede` folders are external dependencies and are not
tested here — only the behaviour this package builds on top of them.
