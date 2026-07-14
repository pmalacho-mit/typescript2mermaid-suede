import { Node, SyntaxKind, TypeNode } from "ts-morph";

/* ----------------------- syntax-level helpers ----------------------- */

/** Name of a type reference, e.g. `Flowchart.Connect` for `Flowchart.Connect<A, B>`. */
export function refName(t: TypeNode | undefined): string | undefined {
  if (!t) return undefined;
  const ref = t.asKind(SyntaxKind.TypeReference);
  if (!ref) return undefined;
  return ref.getTypeName().getText();
}

/** Last segment of a (possibly qualified) type reference name: `Flowchart.Connect` → `Connect`. */
export function lastName(t: TypeNode | undefined): string | undefined {
  return refName(t)?.split(".").pop();
}

/**
 * Namespace qualifier of a type reference (`Flowchart.Diagram` → `Flowchart`),
 * following import aliases so `import { Flowchart as F }` still resolves.
 */
export function qualifierOf(t: TypeNode | undefined): string | undefined {
  const ref = t?.asKind(SyntaxKind.TypeReference);
  if (!ref) return undefined;
  const name = ref.getTypeName();
  if (!Node.isQualifiedName(name)) return undefined;
  const left = name.getLeft();
  try {
    const sym = left.getSymbol();
    const resolved = (sym?.getAliasedSymbol() ?? sym)?.getName();
    // Unresolvable imports yield the checker's `unknown` symbol — prefer syntax.
    if (resolved && resolved !== "unknown" && !resolved.startsWith("__"))
      return resolved;
  } catch {
    // fall through to syntactic name
  }
  return left.getText();
}

/** Type arguments of a type reference. */
export function argsOf(t: TypeNode | undefined): TypeNode[] {
  return t?.asKind(SyntaxKind.TypeReference)?.getTypeArguments() ?? [];
}

/**
 * Follow a type reference through plain type aliases to the node it names, so
 * `type Flow = Flowchart.Diagram<...>` can be used as `Render<Flow>`.
 *
 * Deliberately conservative — a reference is only followed when it takes no type
 * arguments and names an alias that declares no type parameters. Generic aliases
 * would need real type-argument substitution, which is the checker's job, not
 * something worth reimplementing syntactically.
 *
 * Callers must only use this where a DSL construct is expected. Node identity in
 * a flowchart comes from the *name* of the referenced type, so resolving `A` in
 * `Connect<A, B>` down to its `{}` body would destroy the node's id.
 */
export function resolveAlias(t: TypeNode | undefined): TypeNode | undefined {
  let current = t;
  const seen = new Set<TypeNode>();
  while (current && !seen.has(current)) {
    seen.add(current); // self-referential aliases are a type error, but don't hang
    const ref = current.asKind(SyntaxKind.TypeReference);
    if (!ref || ref.getTypeArguments().length > 0) break;
    let decl;
    try {
      const sym = ref.getTypeName().getSymbol();
      decl = (sym?.getAliasedSymbol() ?? sym)?.getDeclarations()?.[0];
    } catch {
      break; // unresolvable import
    }
    if (!decl || !Node.isTypeAliasDeclaration(decl)) break;
    if (decl.getTypeParameters().length > 0) break;
    const next = decl.getTypeNode();
    if (!next) break;
    current = next;
  }
  return current;
}

/** String literal value of a literal type node, e.g. `"topdown"`. */
export function strOf(t: TypeNode | undefined): string | undefined {
  const lit = t?.asKind(SyntaxKind.LiteralType)?.getLiteral();
  if (lit?.isKind(SyntaxKind.StringLiteral)) return lit.getLiteralValue();
  return undefined;
}

/** Numeric literal value of a literal type node, e.g. `5`. */
export function numOf(t: TypeNode | undefined): number | undefined {
  const lit = t?.asKind(SyntaxKind.LiteralType)?.getLiteral();
  if (lit?.isKind(SyntaxKind.NumericLiteral)) return lit.getLiteralValue();
  return undefined;
}

/** Boolean literal (`true` / `false`) of a literal type node. */
export function boolOf(t: TypeNode | undefined): boolean | undefined {
  const lit = t?.asKind(SyntaxKind.LiteralType)?.getLiteral();
  if (lit?.isKind(SyntaxKind.TrueKeyword)) return true;
  if (lit?.isKind(SyntaxKind.FalseKeyword)) return false;
  return undefined;
}

/** Elements of a tuple type node; single non-tuple nodes become a 1-tuple. */
export function tupleOf(t: TypeNode | undefined): TypeNode[] {
  if (!t) return [];
  const tup = t.asKind(SyntaxKind.TupleType);
  if (tup) return tup.getElements();
  return [t];
}

export function fail(msg: string, at?: TypeNode): never {
  const where = at
    ? ` at \`${at.getText()}\` (${at.getSourceFile().getBaseName()}:${at.getStartLineNumber()})`
    : "";
  throw new Error(`typescript2mermaid: ${msg}${where}`);
}

/* ------------------------------ node ids ---------------------------- */

/** Mermaid-safe identifier for a referenced type. */
export function idOf(t: TypeNode): string {
  const name = lastName(t) ?? t.getText();
  return sanitizeId(name);
}

export function sanitizeId(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, "_");
}

/* --------------------- checker-level type expansion ------------------ */

const VISIBILITY_MARKERS: Record<string, string> = {
  Private: "-",
  Protected: "#",
  Internal: "~",
};

/** Entity.Key.* marker name → mermaid key code. */
const KEY_MARKERS: Record<string, string> = {
  Primary: "PK",
  Foreign: "FK",
  Unique: "UK",
};

export interface ResolvedMember {
  name: string;
  /** Declared type text with markers unwrapped (falls back to checker text). */
  typeText: string;
  /** Mermaid visibility symbol (+, -, #, ~). Defaults to "+". */
  visibility: string;
  /** Mermaid key codes for Entity.Key markers on the declaration (PK/FK/UK). */
  keys: string[];
  /** True if this member is callable (renders as a method in class diagrams). */
  isMethod: boolean;
  /** Rendered parameter list for methods, e.g. `name: string`. */
  params: string;
  /** Rendered return type for methods (empty for void). */
  returns: string;
}

/**
 * Fully resolves the type behind a type node (through aliases, intersections,
 * mapped types, etc.) into a flat member list. Marker wrappers (Private,
 * PK, ...) are identity types, so the checker sees clean types; we recover
 * the markers syntactically from each property's original declaration.
 */
export function resolveMembers(t: TypeNode): ResolvedMember[] {
  const type = t.getType();
  const members: ResolvedMember[] = [];

  for (const sym of type.getProperties()) {
    const decl = sym.getDeclarations()[0];
    let declTypeNode: TypeNode | undefined;
    let isMethod = false;
    let params = "";
    let returns = "";

    if (decl && Node.isPropertySignature(decl)) {
      declTypeNode = decl.getTypeNode();
    } else if (decl && Node.isMethodSignature(decl)) {
      isMethod = true;
      params = decl
        .getParameters()
        .map((p) => p.getText())
        .join(", ");
      const ret = decl.getReturnTypeNode()?.getText() ?? "";
      returns = ret === "void" ? "" : ret;
    }

    // Unwrap identity markers (Private<...>, PK<...>, ...), recording them.
    let visibility = "+";
    const keys: string[] = [];
    while (declTypeNode) {
      const name = lastName(declTypeNode);
      if (name && VISIBILITY_MARKERS[name]) {
        visibility = VISIBILITY_MARKERS[name];
        declTypeNode = argsOf(declTypeNode)[0];
      } else if (name && KEY_MARKERS[name]) {
        keys.push(KEY_MARKERS[name]);
        declTypeNode = argsOf(declTypeNode)[0];
      } else break;
    }

    // Function-typed properties render as methods.
    if (declTypeNode?.isKind(SyntaxKind.FunctionType)) {
      const fn = declTypeNode.asKindOrThrow(SyntaxKind.FunctionType);
      isMethod = true;
      params = fn
        .getParameters()
        .map((p) => p.getText())
        .join(", ");
      const ret = fn.getReturnTypeNode()?.getText() ?? "";
      returns = ret === "void" ? "" : ret;
    }

    const typeText = isMethod
      ? ""
      : (declTypeNode?.getText() ??
        (decl
          ? sym.getTypeAtLocation(decl).getText()
          : sym.getDeclaredType().getText()));

    members.push({
      name: sym.getName(),
      typeText,
      visibility,
      keys,
      isMethod,
      params,
      returns,
    });
  }

  return members;
}

/** Numeric-literal properties of an object type (for Pie-from-type bodies). */
export function numericLiteralProps(
  t: TypeNode,
): { name: string; value: number }[] {
  const out: { name: string; value: number }[] = [];
  for (const sym of t.getType().getProperties()) {
    const decl = sym.getDeclarations()[0];
    const propType = decl ? sym.getTypeAtLocation(decl) : sym.getDeclaredType();
    if (propType.isNumberLiteral()) {
      out.push({
        name: sym.getName(),
        value: propType.getLiteralValue() as number,
      });
    }
  }
  return out;
}

/* ----------------------------- label escaping ------------------------ */

/** Escape text for use inside a quoted Mermaid node label. */
export function escapeLabel(s: string): string {
  return s.replace(/"/g, "#quot;");
}
