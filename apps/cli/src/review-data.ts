import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { DECISIONS_FILE, parseDecisions } from "@invariant/governance"
import { type Context, outputDir } from "./commands.js"
import { items } from "./commands-governance.js"
import { loadConfig } from "./config.js"
import { loadCompiled } from "./store.js"

export interface ReviewRow {
  id: string
  kind: "conflict" | "inferred-fact" | "pattern-fact"
  subject: string
  path?: string
  priority: "high" | "medium" | "low"
  reason: string
  confidence?: number
  rule?: string
  /** Where the contract got it: file and line, or the source it came from. */
  evidence: string[]
  /** For a conflict, what each source says. Values are text, cut to a readable length. */
  claims?: Array<{ sourceId: string; status: string; value: string }>
  /** A decision on this item that is recorded in the decisions file but not yet applied by a compile. */
  decision?: { action: string; by: string; at: string; note?: string; source?: string }
}

export interface ReviewState {
  project: string
  contract: { name: string; components: number; tokens: number; patterns: number; guidelines: number }
  /** When the configuration names who may decide, only these names are accepted. */
  approvers?: string[]
  decisionsFile: string
  rows: ReviewRow[]
}

const text = (v: unknown, max = 1500): string => {
  const t = v === undefined ? "(absent)" : typeof v === "string" ? v : JSON.stringify(v, null, 1)
  return t.length > max ? `${t.slice(0, max)}…` : t
}

/** The review queue with what a person needs to decide each item, read from the compiled contract and the decisions file. */
export async function reviewState(c: Context): Promise<ReviewState> {
  const { contract, evidence } = loadCompiled(await outputDir(c))
  const loaded = await loadConfig({
    cwd: c.cwd,
    file: c.args.values.config,
    trustConfig: c.args.values["trust-config"] === true
  })
  const decisionsFile = loaded?.config.governance?.decisionsFile ?? DECISIONS_FILE
  const file = path.resolve(c.cwd, decisionsFile)
  const parsed = existsSync(file) ? parseDecisions(readFileSync(file, "utf8")) : undefined
  const decisions = parsed?.ok ? parsed.value.decisions : []
  const evidenceById = new Map(evidence.evidence.map((e) => [e.id, e]))
  const rows = items(contract).map((i): ReviewRow => {
    const where = i.evidenceIds
      .map((id) => evidenceById.get(id))
      .map((e) =>
        e?.location.type === "file"
          ? `${e.location.path}${e.location.line ? `:${e.location.line}` : ""}`
          : (e?.sourceRef ?? "")
      )
      .filter((x) => x !== "")
    const conflict = i.conflictId ? contract.conflicts.find((x) => x.id === i.conflictId) : undefined
    const trim = (p: string): string => p.replace(/\.\d+$/, "")
    const decided = decisions.find((d) =>
      d.kind === "conflict"
        ? conflict !== undefined && d.id === conflict.id
        : i.path !== undefined && d.subject === i.subject && trim(d.path) === trim(i.path)
    )
    return {
      id: i.id,
      kind: i.kind,
      subject: i.subject,
      ...(i.path ? { path: i.path } : {}),
      priority: i.priority,
      reason: i.reason,
      ...(i.confidence !== undefined ? { confidence: i.confidence } : {}),
      ...(i.rule ? { rule: i.rule } : {}),
      evidence: [...new Set(where)],
      ...(conflict
        ? {
            claims: conflict.claims.map((cl) => ({
              sourceId: cl.sourceId,
              status: cl.status,
              value: text(cl.value)
            }))
          }
        : {}),
      ...(decided
        ? {
            decision: {
              action: decided.action,
              by: decided.by,
              at: decided.at,
              ...(decided.note ? { note: decided.note } : {}),
              ...(decided.kind === "conflict" && decided.chosenSourceId
                ? { source: decided.chosenSourceId }
                : {})
            }
          }
        : {})
    }
  })
  const approvers = loaded?.config.governance?.approvers
  return {
    project: path.basename(c.cwd),
    contract: {
      name: contract.metadata.name,
      components: contract.components.length,
      tokens: contract.tokens.length,
      patterns: contract.patterns.length,
      guidelines: contract.guidelines.length
    },
    ...(approvers && approvers.length > 0 ? { approvers } : {}),
    decisionsFile,
    rows
  }
}
