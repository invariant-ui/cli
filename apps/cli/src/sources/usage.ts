import { posix } from "node:path"
import type { Contract } from "@invariant/contract"
import { DesignSystem } from "@invariant/contract-query"
import { type CandidatesFile, discover, type ReviewsFile } from "@invariant/validation"
import type { Compiled } from "../store.js"
import { MAX_FILE_BYTES, NOT_DECLARATION, type Scan } from "./scan.js"

/** Files that can use a component: React, Vue, Angular templates (`.html`, and inline templates in `*.component.ts`), HTML. */
const MARKUP_FILE = /\.(tsx|jsx|vue|html?)$|\.component\.ts$/i

const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "")

/** What a template or JSX file can call a component by: its name, its export name and its selector. */
export function componentKeys(contract: Contract): Set<string> {
  const keys = new Set<string>()
  for (const c of contract.components) {
    keys.add(squash(c.name))
    for (const i of c.implementations) {
      if (i.exportName) keys.add(squash(i.exportName))
      const sel = (i.extensions?.[i.framework] as { selector?: unknown } | undefined)?.selector
      if (typeof sel === "string") keys.add(squash(/^[a-z][a-z0-9-]*/.exec(sel)?.[0] ?? ""))
    }
  }
  keys.delete("")
  return keys
}

/** The files that define the contract's components, as project-relative paths (adapters may report them package-relative). */
export function definitionFiles(contract: Contract, sourceDirs: readonly string[]): Set<string> {
  const out = new Set<string>()
  for (const c of contract.components)
    for (const i of c.implementations)
      for (const ext of Object.values(i.extensions ?? {})) {
        const file = (ext as { file?: unknown } | undefined)?.file
        if (typeof file !== "string") continue
        out.add(file)
        for (const d of sourceDirs) out.add(posix.join(d, file))
      }
  return out
}

export interface UsageResult {
  candidates: CandidatesFile
  /** Files that mention a component of the contract, and were read to find patterns. */
  usageFiles: string[]
  /** Files that could use a component and were read to find out. */
  filesRead: number
}

/**
 * Looks at every file in the project that can use a component (not only application folders), keeps those that mention
 * one of the contract's components, and finds the structures that recur in them. The files that define the components
 * are left out: patterns describe how the design system is used, not how it is built. Reads only; nothing is run.
 */
export async function findPatterns(input: {
  scan: Scan
  compiled: Compiled
  /** Limits the search to these project-relative paths (setup's `--paths`). Empty means the whole project. */
  within?: readonly string[]
  exclude: ReadonlySet<string>
  reviews?: ReviewsFile | undefined
  onProgress?: (read: number) => void
}): Promise<UsageResult> {
  const { scan, compiled } = input
  const ds = new DesignSystem(compiled.contract, compiled.evidence)
  const keys = componentKeys(compiled.contract)
  const within = (input.within ?? []).map((p) => p.replace(/\/+$/, ""))
  const candidates = scan.files.filter(
    (f) =>
      MARKUP_FILE.test(f) &&
      !NOT_DECLARATION.test(f) &&
      !input.exclude.has(f) &&
      (within.length === 0 || within.some((p) => f === p || f.startsWith(`${p}/`)))
  )
  const usage: Array<{ file: string; code: string }> = []
  let read = 0
  for (const file of candidates) {
    let code: string
    try {
      code = await scan.fs.readFile(file)
    } catch {
      continue
    }
    read++
    if (read % 200 === 0) input.onProgress?.(read)
    if (code.length > MAX_FILE_BYTES) continue
    for (const m of code.matchAll(/<([A-Za-z][\w.:-]*)/g))
      if (keys.has(squash((m[1] ?? "").replace(/^.*:/, "")))) {
        usage.push({ file, code })
        break
      }
  }
  const result = discover({ ds, files: usage, ...(input.reviews ? { reviews: input.reviews } : {}) })
  return { candidates: result, usageFiles: usage.map((u) => u.file), filesRead: read }
}
