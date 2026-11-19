import ts from "typescript"

/**
 * One component found in one file by a framework's syntax analysis. Framework-neutral on purpose: setup discovery
 * reads these without knowing which parser produced them. Syntax only: nothing is type-checked or run.
 */
export interface DetectedComponent {
  name: string
  /** Project-relative POSIX path of the file that declares it. */
  file: string
  line: number
  framework: "react" | "vue" | "angular"
  /** Declaration form, as the framework calls it (`function`, `forwardRef`, `class`, `sfc`, `@Component`). */
  kind: string
  /** The file makes it importable by another file (export modifier, `export { X }`, default export, SFC). */
  exported: boolean
  /** The component declares a typed or configurable public API (typed props, `defineProps`, `@Input`, `input()`). */
  typedApi: boolean
}

/** The module specifiers a JS/TS file imports or re-exports, by syntax (`ts.preProcessFile`): nothing is resolved or run. */
export function moduleSpecifiers(text: string): string[] {
  return ts.preProcessFile(text, true, true).importedFiles.map((f) => f.fileName)
}
