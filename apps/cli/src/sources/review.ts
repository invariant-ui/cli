import { paint } from "../format.js"
import type { Io } from "../io.js"
import { type ComponentSource, mergeDecisions } from "./approval.js"
import type { DirectoryCandidate } from "./discover.js"

export interface ReviewUi {
  say(message?: string): void
  flag(message: string): void
}

export interface Added {
  candidate: DirectoryCandidate
  type: "directory" | "file"
}

export interface ReviewInput {
  candidates: DirectoryCandidate[]
  prior: ComponentSource[]
  /** Looks at a path the person typed. A string is the reason it cannot be used. */
  addPath(rel: string): Promise<Added | string>
}

export interface ReviewResult {
  decisions: ComponentSource[]
  candidates: DirectoryCandidate[]
}

const TOP = 40
const label = (
  c: DirectoryCandidate,
  prior: ReadonlyMap<string, ComponentSource>,
  multi: boolean
): string => {
  const was = prior.get(c.path)?.status
  return [
    `${multi && c.packageName ? `${c.packageName}: ` : ""}${c.path}`,
    `${c.componentCount} component${c.componentCount === 1 ? "" : "s"}`,
    `${c.classification.confidence} confidence`,
    ...(c.suggestion ? [`suggested by ${c.suggestion.by} (${c.suggestion.confidence})`] : []),
    ...(c.classification.category === "examples"
      ? ["examples"]
      : c.recommendation === "potential"
        ? ["potential"]
        : []),
    ...(was === "excluded" ? ["previously excluded"] : [])
  ].join(" · ")
}

export function describeComponents(c: DirectoryCandidate): string[] {
  const lines = c.components.slice(0, TOP).map((x) => {
    const flags = [
      x.framework,
      x.category,
      ...(x.public ? ["public"] : []),
      ...(x.stories ? ["stories"] : []),
      ...(x.negatives.length > 0 ? [`app-specific: ${x.negatives[0]}`] : [])
    ]
    return `  ${x.name}  ${x.file}:${x.line}  (${flags.join(", ")})`
  })
  return [...lines, ...(c.components.length > TOP ? [`  +${c.components.length - TOP} more`] : [])]
}

export function describeEvidence(c: DirectoryCandidate): string[] {
  return [
    `${c.path}: score ${c.classification.score}/100, ${c.classification.confidence} confidence, ${c.recommendation.replace("-", " ")}. A heuristic, not a probability.`,
    ...(c.suggestion
      ? [
          `  ${c.suggestion.by} suggested it (${c.suggestion.confidence} confidence): ${c.suggestion.reason}`,
          "  That is an AI agent's judgment. Setup only checked that the directory exists and holds components."
        ]
      : []),
    ...c.classification.evidence.map(
      (e) => `  ${e.weight > 0 ? "+" : e.weight < 0 ? "-" : " "}${Math.abs(e.weight)}  ${e.detail}`
    )
  ]
}

/**
 * Directory-level review: tick the directories that are the design system's component sources, look inside them, add
 * paths or single files, then confirm. Nothing is approved until the person confirms. Returns undefined when they stop.
 */
export async function reviewSources(
  io: Io,
  ui: ReviewUi,
  input: ReviewInput
): Promise<ReviewResult | undefined> {
  const prior = new Map(input.prior.map((p) => [p.path, p]))
  const cands = [...input.candidates]
  const added = new Map<string, Added["type"]>()
  const weak = cands.filter((c) => c.recommendation === "not-recommended" && !prior.has(c.path))
  // Weak directories are set aside to keep the list short. When every directory is weak there is nothing else to choose from.
  const hidden = weak.length === cands.length ? [] : weak
  const shown = (): DirectoryCandidate[] => cands.filter((c) => !hidden.includes(c))
  const ticked = new Set(
    cands
      .filter(
        (c) =>
          prior.get(c.path)?.status === "approved" ||
          (c.recommendation === "recommended" && prior.get(c.path)?.status !== "excluded")
      )
      .map((c) => c.path)
  )
  const multi = new Set(cands.map((c) => c.packageDir)).size > 1
  // No answer at all (input closed) ends the review rather than looping on empty answers.
  let closed = false
  const ask = async (q: string): Promise<string> => {
    const a = await io.prompt?.(`${paint("accent", "◆")}  ${q}`)
    if (a === undefined) closed = true
    return (a ?? "").trim()
  }
  // A component counts once even when two ticked directories contain it (a directory and one inside it).
  const count = (): { components: number; dirs: number } => ({
    components: new Set(
      cands.filter((c) => ticked.has(c.path)).flatMap((c) => c.components.map((k) => `${k.file}#${k.name}`))
    ).size,
    dirs: ticked.size
  })
  const pickIndex = async (question: string): Promise<DirectoryCandidate | undefined> => {
    const list = shown()
    if (list.length === 1) return list[0]
    if (io.select) {
      const picked = await io.select(
        question,
        list.map((c, i) => ({
          value: String(i),
          label: label(c, prior, multi),
          key: i < 9 ? String(i + 1) : ""
        }))
      )
      return picked === undefined ? undefined : list[Number(picked)]
    }
    for (const [i, c] of list.entries()) ui.say(`${i + 1}. ${label(c, prior, multi)}`)
    return list[Number(await ask(`${question} (number): `)) - 1]
  }
  const selectDirs = async (): Promise<boolean> => {
    const list = shown()
    if (io.multiselect) {
      const picked = await io.multiselect(
        "Which directories are your design system's component sources?",
        list.map((c, i) => ({ value: String(i), label: label(c, prior, multi), ticked: ticked.has(c.path) }))
      )
      if (picked === undefined) return false
      for (const c of list) ticked.delete(c.path)
      for (const p of picked) ticked.add(list[Number(p)]?.path ?? "")
      return true
    }
    ui.say("Which directories are your design system's component sources?")
    for (const [i, c] of list.entries())
      ui.say(`${i + 1}. [${ticked.has(c.path) ? "x" : " "}] ${label(c, prior, multi)}`)
    const a = (
      await ask("Enter keeps the [x] ones, numbers (like 1,3) replace the selection, n for none: ")
    ).toLowerCase()
    if (a === "n" || a === "none") ticked.clear()
    else if (a !== "") {
      ticked.clear()
      for (const n of a.split(/[,\s]+/)) {
        const c = list[Number(n) - 1]
        if (c) ticked.add(c.path)
      }
    }
    return true
  }
  if (hidden.length > 0)
    ui.say(
      `${hidden.length} more director${hidden.length === 1 ? "y" : "ies"} found but not recommended (${hidden.map((c) => c.path).join(", ")}). Add one with "add" if it belongs.`
    )
  if (shown().length === 0)
    ui.say('The scan found no directory to choose from. Add one with "add" (a path from the project root).')
  else if (!(await selectDirs()) || closed) return undefined
  for (;;) {
    const n = count()
    type Next = "confirm" | "add" | "view" | "evidence" | "select"
    let next: Next | undefined
    if (io.select) {
      next = await io.select<Next>("Next?", [
        {
          value: "confirm",
          label: `Confirm: ${n.components} components in ${n.dirs} director${n.dirs === 1 ? "y" : "ies"}`,
          key: "c"
        },
        { value: "add", label: "Add a directory or component file", key: "a" },
        { value: "view", label: "View the components in a directory", key: "v" },
        { value: "evidence", label: "Inspect discovery evidence", key: "e" },
        { value: "select", label: "Change the selection", key: "s" }
      ])
      if (next === undefined) return undefined
    } else {
      const a = (
        await ask(
          `${n.components} components in ${n.dirs} director${n.dirs === 1 ? "y" : "ies"}. [c]onfirm, [a]dd, [v]iew, [e]vidence, [s]elect again, [q]uit (Enter confirms): `
        )
      ).toLowerCase()
      if (closed || a.startsWith("q")) return undefined
      next = a.startsWith("a")
        ? "add"
        : a.startsWith("v")
          ? "view"
          : a.startsWith("e")
            ? "evidence"
            : a.startsWith("s")
              ? "select"
              : "confirm"
    }
    if (next === "confirm") {
      if (n.dirs === 0) {
        ui.flag("nothing is selected, so there would be no component source. Select a directory or add one.")
        continue
      }
      break
    }
    if (next === "select") await selectDirs()
    else if (next === "view" || next === "evidence") {
      const c = await pickIndex(next === "view" ? "View which directory?" : "Inspect which directory?")
      if (c) for (const l of next === "view" ? describeComponents(c) : describeEvidence(c)) ui.say(l)
    } else {
      const p = await ask("Directory or component file to add (path from the project root): ")
      if (closed) return undefined
      if (p === "") continue
      const r = await input.addPath(p.replace(/^\.\//, "").replace(/\/+$/, ""))
      if (typeof r === "string") ui.flag(r)
      else {
        const at = cands.findIndex((c) => c.path === r.candidate.path)
        if (at >= 0) cands[at] = r.candidate
        else cands.push(r.candidate)
        added.set(r.candidate.path, r.type)
        ticked.add(r.candidate.path)
        ui.say(
          `added ${r.candidate.path}: ${r.candidate.componentCount} component${r.candidate.componentCount === 1 ? "" : "s"}`
        )
      }
    }
  }
  const decisions: ComponentSource[] = []
  for (const c of shown()) {
    const user = added.has(c.path)
    const agent = !user && c.foundBy === "agent"
    decisions.push({
      path: c.path,
      type: added.get(c.path) ?? "directory",
      source: user ? "user" : agent ? "agent" : "discovered",
      status: ticked.has(c.path) ? "approved" : "excluded",
      // Where an AI agent had a say, the saved decision keeps who, how sure it was and why.
      ...(c.suggestion && !user
        ? {
            note: `${agent ? "" : "also "}suggested by ${c.suggestion.by} (${c.suggestion.confidence} confidence): ${c.suggestion.reason}`.slice(
              0,
              600
            )
          }
        : {})
    })
  }
  return { decisions: mergeDecisions(input.prior, decisions), candidates: cands }
}

/** The decisions when nobody can be asked: `--include` and `--yes` (the recommended directories) approve, `--exclude` rejects. */
export function decideWithoutAsking(input: {
  candidates: DirectoryCandidate[]
  prior: ComponentSource[]
  yes: boolean
  include: Added[]
  exclude: Array<{ path: string; type: ComponentSource["type"] }>
}): ReviewResult {
  const decisions: ComponentSource[] = []
  const priorStatus = new Map(input.prior.map((p) => [p.path, p.status]))
  for (const c of input.candidates) {
    const ok = input.yes && c.recommendation === "recommended" && priorStatus.get(c.path) !== "excluded"
    decisions.push({
      path: c.path,
      type: "directory",
      source: "discovered",
      status: ok ? "approved" : "pending"
    })
  }
  for (const a of input.include)
    decisions.push({ path: a.candidate.path, type: a.type, source: "user", status: "approved" })
  for (const e of input.exclude)
    decisions.push({ path: e.path, type: e.type, source: "user", status: "excluded" })
  const candidates = [...input.candidates]
  for (const a of input.include)
    if (!candidates.some((c) => c.path === a.candidate.path)) candidates.push(a.candidate)
  return { decisions: mergeDecisions(input.prior, decisions), candidates }
}
