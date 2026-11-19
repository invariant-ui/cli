import type { DetectedComponent } from "@invariant/compiler-core"
import ts from "typescript"

const decoratorName = (d: ts.Decorator): string => {
  const e = d.expression
  const callee = ts.isCallExpression(e) ? e.expression : e
  return ts.isIdentifier(callee) ? callee.text : ""
}

/** Finds classes decorated with `@Component` in one `.ts` file by syntax, and says whether they declare inputs. */
export function detectAngularComponents(file: string, text: string): DetectedComponent[] {
  if (!/\.ts$/i.test(file) || /\.d\.ts$/i.test(file)) return []
  // Most files in a large repository are not components: skip the parse unless the decorator is there.
  if (!/@\s*Component\b/.test(text)) return []
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
  const out: DetectedComponent[] = []
  for (const st of sf.statements) {
    if (!ts.isClassDeclaration(st) || !st.name) continue
    const decorators = ts.canHaveDecorators(st) ? (ts.getDecorators(st) ?? []) : []
    if (!decorators.some((d) => decoratorName(d) === "Component")) continue
    const typedApi = st.members.some((m) => {
      const ds = ts.canHaveDecorators(m) ? (ts.getDecorators(m) ?? []) : []
      if (ds.some((d) => ["Input", "Output"].includes(decoratorName(d)))) return true
      const init = ts.isPropertyDeclaration(m) ? m.initializer : undefined
      return (
        init !== undefined &&
        ts.isCallExpression(init) &&
        ts.isIdentifier(init.expression) &&
        ["input", "output", "model"].includes(init.expression.text)
      )
    })
    const exported = ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
    out.push({
      name: st.name.text,
      file,
      line: sf.getLineAndCharacterOfPosition(st.getStart(sf)).line + 1,
      framework: "angular",
      kind: "@Component",
      exported,
      typedApi
    })
  }
  return out
}
