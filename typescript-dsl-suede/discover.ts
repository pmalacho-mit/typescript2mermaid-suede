/**
 * Ways to find your DSL's constructs in a file.
 *
 * These are a menu, not a mandate — every one of them is optional, and an
 * `Analyzer` is free to walk the AST however it likes. They exist because a few
 * discovery shapes come up repeatedly:
 *
 *   - named type aliases, possibly inside a namespace, possibly exported
 *     (`export type Simple = Case<...>` inside `namespace Test`)
 *   - every use of a construct anywhere in the file, wherever it appears
 *     (`Case<...>` nested in a tuple, a return type, another construct)
 *   - annotations on members of ordinary types, which erase completely
 */
import {
  Node,
  type SourceFile,
  SyntaxKind,
  type TypeAliasDeclaration,
  type TypeNode,
  type TypeReferenceNode,
} from "ts-morph";
import { lastName, refName } from "./parse.js";

/* ----------------------------- namespaces ---------------------------- */

/**
 * Enclosing namespace path of a node, outermost first: a declaration inside
 * `namespace Test { namespace Unit { ... } }` yields `["Test", "Unit"]`.
 * Top-level declarations yield `[]`.
 */
export function namespacePath(node: Node): string[] {
  const path: string[] = [];
  let current: Node | undefined = node.getParent();
  while (current) {
    if (Node.isModuleDeclaration(current)) path.unshift(current.getName());
    current = current.getParent();
  }
  return path;
}

/** Matches a namespace path: a name, a path, or a predicate. */
export type NamespaceQuery =
  | string
  | readonly string[]
  | ((path: string[]) => boolean);

export function matchesNamespace(
  path: string[],
  query: NamespaceQuery | undefined,
): boolean {
  if (query === undefined) return true;
  if (typeof query === "function") return query(path);
  const want = typeof query === "string" ? [query] : query;
  // A prefix match, so `namespace: "Test"` also finds `Test.Unit` members.
  return want.every((segment, i) => path[i] === segment);
}

/* --------------------------- type aliases ---------------------------- */

export interface TypeAliasQuery {
  /** Restrict to (or exclude) exported aliases. Omit to accept both. */
  exported?: boolean;
  /** Restrict to aliases declared within a namespace. */
  namespace?: NamespaceQuery;
  /** Descend into namespaces and nested scopes. Default `true`. */
  recursive?: boolean;
  /** Filter by alias name. */
  name?: string | readonly string[] | ((name: string) => boolean);
}

const matchesName = (
  name: string,
  query: TypeAliasQuery["name"],
): boolean => {
  if (query === undefined) return true;
  if (typeof query === "function") return query(name);
  return typeof query === "string" ? name === query : query.includes(name);
};

/**
 * Type aliases in a file. Unlike `SourceFile.getTypeAliases()`, this reaches
 * declarations nested inside namespaces by default — which is where a DSL that
 * groups its declarations (`namespace Test { ... }`) puts all of them.
 */
export function typeAliases(
  source: SourceFile,
  query: TypeAliasQuery = {},
): TypeAliasDeclaration[] {
  const { exported, namespace, recursive = true, name } = query;
  const all = recursive
    ? source.getDescendantsOfKind(SyntaxKind.TypeAliasDeclaration)
    : source.getTypeAliases();
  return all.filter(
    (alias) =>
      (exported === undefined || alias.isExported() === exported) &&
      matchesName(alias.getName(), name) &&
      matchesNamespace(namespacePath(alias), namespace),
  );
}

/**
 * A declaration's dotted path including its namespaces — `Test.Unit.Simple`.
 * A good default `Finding.id`: stable across edits and unique within a file.
 */
export const qualifiedName = (
  node: Node & { getName(): string },
): string => [...namespacePath(node), node.getName()].join(".");

/* -------------------------- type references -------------------------- */

/** Matches a type reference by its last name segment. */
export type NameQuery =
  | string
  | readonly string[]
  | ((name: string) => boolean);

const matchesLastName = (name: string | undefined, query: NameQuery): boolean => {
  if (name === undefined) return false;
  if (typeof query === "function") return query(name);
  return typeof query === "string" ? name === query : query.includes(name);
};

export interface TypeReferenceQuery {
  /**
   * Only references whose root identifier was imported from this module. Guards
   * against a local type that happens to share a name with one of your
   * constructs — cheap and syntactic, so it also works mid-edit when the
   * checker cannot resolve the import.
   */
  importedFrom?: string | ((moduleSpecifier: string) => boolean);
  /** Skip references nested inside another matched reference. Default `false`. */
  outermostOnly?: boolean;
}

/**
 * Local names introduced by importing from a module — named bindings, a default
 * import, or a namespace import. Aliases (`import { Case as C }`) yield the
 * local name, which is what appears in the type reference.
 */
export function importedNames(
  source: SourceFile,
  from: string | ((moduleSpecifier: string) => boolean),
): Set<string> {
  const match =
    typeof from === "function" ? from : (s: string) => s === from;
  const names = new Set<string>();
  for (const decl of source.getImportDeclarations()) {
    if (!match(decl.getModuleSpecifierValue())) continue;
    const def = decl.getDefaultImport();
    if (def) names.add(def.getText());
    const ns = decl.getNamespaceImport();
    if (ns) names.add(ns.getText());
    for (const named of decl.getNamedImports())
      names.add((named.getAliasNode() ?? named.getNameNode()).getText());
  }
  return names;
}

/**
 * Every use of a construct in a file, wherever it appears — nested in a tuple,
 * inside another construct, as a return type. This is the discovery shape for a
 * DSL whose constructs are used inline rather than declared at a known place.
 */
export function typeReferences(
  source: SourceFile,
  name: NameQuery,
  { importedFrom, outermostOnly = false }: TypeReferenceQuery = {},
): TypeReferenceNode[] {
  const local = importedFrom
    ? importedNames(source, importedFrom)
    : undefined;

  const hits = source
    .getDescendantsOfKind(SyntaxKind.TypeReference)
    .filter((ref) => {
      if (!matchesLastName(lastName(ref), name)) return false;
      if (!local) return true;
      // `Case` → "Case"; `T.Case` → "T" (a namespace import).
      const root = refName(ref)?.split(".")[0];
      return root !== undefined && local.has(root);
    });

  if (!outermostOnly) return hits;
  const set = new Set<Node>(hits);
  return hits.filter((ref) => !ref.getAncestors().some((a) => set.has(a)));
}

/** The type alias a node is (transitively) part of, if any. */
export function enclosingTypeAlias(
  node: Node,
): TypeAliasDeclaration | undefined {
  return node.getFirstAncestorByKind(SyntaxKind.TypeAliasDeclaration);
}

/* ---------------------------- member markers ------------------------- */

/**
 * Peel identity-marker wrappers off a type node, returning the markers found
 * (outermost first) and the node underneath.
 *
 * An identity marker (`type Secret<T> = T`) annotates without changing what the
 * type *is* — the checker sees straight through it, so it must be recovered
 * syntactically. Zero-cost metadata that erases completely.
 */
export function unwrapMarkers(
  type: TypeNode | undefined,
  isMarker: (name: string) => boolean,
): { markers: string[]; type: TypeNode | undefined } {
  const markers: string[] = [];
  let current = type;
  while (current) {
    const name = lastName(current);
    if (name === undefined || !isMarker(name)) break;
    markers.push(name);
    current = current
      .asKind(SyntaxKind.TypeReference)
      ?.getTypeArguments()[0];
  }
  return { markers, type: current };
}
