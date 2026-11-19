import type { DetectedComponent } from "@invariant/compiler-core"
import ts from "typescript"

const PASCAL = /^[A-Z]/
const WRAPPERS = new Set(["forwardRef", "memo", "React.forwardRef", "React.memo"])
const CLASS_BASES = new Set(["Component", "React.Component", "PureComponent", "React.PureComponent"])

const calleeName = (e: ts.Expression): string =>
  ts.isIdentifier(e)
    ? e.text
    : ts.isPropertyAccessExpression(e)
      ? `${calleeName(e.expression)}.${e.name.text}`
      : ""

function hasJsx(node: ts.Node): boolean {
  let found = false
  const visit = (n: ts.Node): void => {
    if (found) return
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) found = true
    else ts.forEachChild(n, visit)
  }
  visit(node)
  return found
}

const isFn = (n: ts.Node | undefined): n is ts.ArrowFunction | ts.FunctionExpression =>
  n !== undefined && (ts.isArrowFunction(n) || ts.isFunctionExpression(n))

/** Strips `forwardRef(...)` and `memo(...)` wrappers, returning the wrapped function and the outermost wrapper. */
function unwrap(e: ts.Expression): { fn?: ts.ArrowFunction | ts.FunctionExpression; wrapper?: string } {
  let wrapper: string | undefined
  let cur: ts.Expression = e
  while (ts.isCallExpression(cur) && WRAPPERS.has(calleeName(cur.expression))) {
    wrapper ??= calleeName(cur.expression).replace("React.", "")
    const arg = cur.arguments[0]
    if (!arg) return wrapper ? { wrapper } : {}
    cur = arg
  }
  return isFn(cur) ? { fn: cur, ...(wrapper ? { wrapper } : {}) } : wrapper ? { wrapper } : {}
}

const typedParam = (fn: ts.SignatureDeclarationBase): boolean => !!fn.parameters[0]?.type

/**
 * Finds React components in one `.tsx`/`.jsx` file by syntax: a capitalized function or arrow function that returns
 * JSX, `forwardRef` and `memo` wrappers around one, and classes that extend `Component`. Nothing is type-checked.
 */
export function detectReactComponents(file: string, text: string): DetectedComponent[] {
  if (!/\.(tsx|jsx)$/i.test(file)) return []
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX)
  const exportedNames = new Set<string>()
  let defaultExport: string | undefined
  for (const st of sf.statements) {
    if (
      ts.isExportDeclaration(st) &&
      !st.moduleSpecifier &&
      st.exportClause &&
      ts.isNamedExports(st.exportClause)
    )
      for (const el of st.exportClause.elements) exportedNames.add((el.propertyName ?? el.name).text)
    if (ts.isExportAssignment(st) && ts.isIdentifier(st.expression)) defaultExport = st.expression.text
  }
  const out: DetectedComponent[] = []
  const line = (n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
  const modifiers = (n: ts.Node): readonly ts.Modifier[] =>
    ts.canHaveModifiers(n) ? (ts.getModifiers(n) ?? []) : []
  const isExported = (n: ts.Node, name: string): boolean =>
    modifiers(n).some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ||
    exportedNames.has(name) ||
    defaultExport === name
  const add = (n: ts.Node, name: string, kind: string, typed: boolean): void => {
    out.push({
      name,
      file,
      line: line(n),
      framework: "react",
      kind,
      exported: isExported(n, name),
      typedApi: typed
    })
  }
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.body) {
      const name =
        st.name?.text ?? (modifiers(st).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ? "default" : "")
      if (name !== "" && (PASCAL.test(name) || name === "default") && hasJsx(st.body))
        add(st, name, "function", typedParam(st))
    } else if (ts.isClassDeclaration(st)) {
      const base = st.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword)?.types[0]
      if (st.name && base && CLASS_BASES.has(calleeName(base.expression)) && PASCAL.test(st.name.text))
        add(st, st.name.text, "class", base.typeArguments !== undefined)
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !PASCAL.test(d.name.text) || !d.initializer) continue
        const { fn, wrapper } = unwrap(d.initializer)
        const typedGeneric =
          ts.isCallExpression(d.initializer) && (d.initializer.typeArguments?.length ?? 0) > 0
        const annotated = d.type !== undefined
        if (fn && hasJsx(fn.body))
          out.push({
            name: d.name.text,
            file,
            line: line(d),
            framework: "react",
            kind: wrapper ?? "function",
            exported: isExported(st, d.name.text),
            typedApi: typedParam(fn) || typedGeneric || annotated
          })
      }
    }
  }
  return out
}
