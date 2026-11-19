import type { SourceAdapter } from "@invariant/compiler-core"
import type { IrDocument } from "@invariant/compiler-ir"
import { type ComponentSource, inScope } from "./approval.js"

const FILE_FACT = /^implementations\.[^.]+\.extensions\.(react|vue|angular)\.file$/

/**
 * Leaves out the components whose file is outside the approved paths: their entity, their facts, and facts of other
 * entities that point at them. Says so in a diagnostic, because leaving something out is never silent.
 */
export function scopeIr(ir: IrDocument, scope: readonly ComponentSource[]): IrDocument {
  const fileOf = new Map<string, string>()
  for (const f of ir.facts)
    if (FILE_FACT.test(f.path) && typeof f.value === "string") fileOf.set(f.subject, f.value)
  const dropped = new Set(
    ir.entities
      .filter(
        (e) => e.kind === "component" && fileOf.has(e.ref) && !inScope(fileOf.get(e.ref) as string, scope)
      )
      .map((e) => e.ref)
  )
  if (dropped.size === 0) return ir
  const pointsAtDropped = (value: unknown): boolean => {
    const text = JSON.stringify(value)
    for (const ref of dropped) if (text.includes(`"${ref}"`)) return true
    return false
  }
  return {
    ...ir,
    entities: ir.entities.filter((e) => !dropped.has(e.ref)),
    facts: ir.facts.filter((f) => !dropped.has(f.subject) && !pointsAtDropped(f.value)),
    diagnostics: [
      ...ir.diagnostics,
      {
        code: "scope.components-left-out",
        severity: "info",
        message: `${dropped.size} component(s) are outside the approved componentSources and were left out`,
        sourceId: ir.source.id
      }
    ]
  }
}

/** Wraps a framework adapter so it only reports components inside the approved paths. Other adapters are untouched. */
export function scopedToComponents(adapter: SourceAdapter, scope: readonly ComponentSource[]): SourceAdapter {
  return {
    ...adapter,
    extract: async (context, config) => {
      const r = await adapter.extract(context, config)
      return { ...r, ir: scopeIr(r.ir, scope) }
    }
  } as SourceAdapter
}
