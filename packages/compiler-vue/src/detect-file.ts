import { componentNameFromFile, type DetectedComponent } from "@invariant/compiler-core"
import ts from "typescript"
import { parseSfc } from "./sfc.js"

/**
 * Finds the component a `.vue` file declares (the file is the component) and `defineComponent(...)` modules, by
 * syntax. `typedApi` is true when the component declares props, through `defineProps` or a `props` option.
 */
export function detectVueComponents(file: string, text: string): DetectedComponent[] {
  if (/\.vue$/i.test(file)) {
    const { descriptor, errors } = parseSfc(file, text)
    if (errors.length > 0 && !descriptor.template && !descriptor.scriptSetup && !descriptor.script) return []
    if (!descriptor.template && !descriptor.scriptSetup && !descriptor.script) return []
    const script = `${descriptor.scriptSetup?.content ?? ""}\n${descriptor.script?.content ?? ""}`
    return [
      {
        name: componentNameFromFile(file),
        file,
        line: 1,
        framework: "vue",
        kind: "sfc",
        exported: true,
        typedApi: /\bdefineProps\b|\bprops\s*:/.test(script)
      }
    ]
  }
  if (!/\.(ts|js|tsx|jsx)$/i.test(file) || !text.includes("defineComponent")) return []
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true)
  const out: DetectedComponent[] = []
  const isDefine = (e: ts.Node): e is ts.CallExpression =>
    ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === "defineComponent"
  const typed = (c: ts.CallExpression): boolean => {
    const arg = c.arguments[0]
    return (
      !!arg &&
      ts.isObjectLiteralExpression(arg) &&
      arg.properties.some((p) => p.name && ts.isIdentifier(p.name) && p.name.text === "props")
    )
  }
  for (const st of sf.statements) {
    const line = sf.getLineAndCharacterOfPosition(st.getStart(sf)).line + 1
    if (ts.isVariableStatement(st))
      for (const d of st.declarationList.declarations)
        if (ts.isIdentifier(d.name) && d.initializer && isDefine(d.initializer))
          out.push({
            name: d.name.text,
            file,
            line,
            framework: "vue",
            kind: "defineComponent",
            exported: ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false,
            typedApi: typed(d.initializer)
          })
    if (ts.isExportAssignment(st) && isDefine(st.expression))
      out.push({
        name: componentNameFromFile(file),
        file,
        line,
        framework: "vue",
        kind: "defineComponent",
        exported: true,
        typedApi: typed(st.expression)
      })
  }
  return out
}
