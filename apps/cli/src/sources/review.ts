import { paint } from "../format.js"
import type { Io } from "../io.js"
import { type ComponentSource, decisionsFromSelection, mergeDecisions, statusFor } from "./approval.js"
import type { DirectoryCandidate, DiscoveredComponent } from "./discover.js"

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
  /**
   * Present when an AI agent can be asked. `label` says what asking involves. `run` gets the directories shown now and
   * resolves them with what the agent named marked, "stopped" to end setup, or undefined when nothing came of it.
   */
  askAgent?: {
    label: string
    run(current: DirectoryCandidate[]): Promise<DirectoryCandidate[] | "stopped" | undefined>
  }
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
        : c.recommendation === "not-recommended"
          ? ["not recommended"]
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

/** One row of the list: the components a source file holds, and where they are. A file is the unit, because compile reads by file. */
function itemLabel(file: string, comps: readonly DiscoveredComponent[], dir: string): string {
  const names = comps.map((c) => c.name)
  const shown = `${names.slice(0, 3).join(", ")}${names.length > 3 ? ` (+${names.length - 3})` : ""}`
  const rel = file.startsWith(`${dir}/`) ? file.slice(dir.length + 1) : (file.split("/").pop() ?? file)
  const first = comps[0]
  const tags = [
    ...(comps.some((c) => c.public) ? ["public"] : []),
    ...(comps.some((c) => c.stories) ? ["stories"] : []),
    ...(comps.length === 1 && first && first.negatives.length > 0
      ? [`app-specific: ${first.negatives[0]}`]
      : [])
  ]
  return `${shown}  ${rel}:${first?.line ?? 1}${tags.length > 0 ? `  · ${tags.join(" · ")}` : ""}`
}

/** Past this many rows the list starts folded, so the groups can be seen at once and opened one by one. */
const FOLD_ABOVE = 400

/**
 * The review: a complete list of every component file the scan found, grouped by directory, to tick or untick one by one,
 * by group, or all at once; then look inside a directory, see the evidence, add a path, or ask an AI agent, and confirm.
 * Nothing is approved until the person confirms. Returns undefined when they stop.
 */
export async function reviewSources(
  io: Io,
  ui: ReviewUi,
  input: ReviewInput
): Promise<ReviewResult | undefined> {
  const prior = new Map(input.prior.map((p) => [p.path, p]))
  const cands = [...input.candidates]
  const added = new Map<string, Added["type"]>()
  const multi = new Set(cands.map((c) => c.packageDir)).size > 1
  // No answer at all (input closed) ends the review rather than looping on empty answers.
  let closed = false
  const ask = async (q: string): Promise<string> => {
    const a = await io.prompt?.(`${paint("accent", "◆")}  ${q}`)
    if (a === undefined) closed = true
    return (a ?? "").trim()
  }

  const filesOf = (c: DirectoryCandidate): string[] => [...new Set(c.components.map((k) => k.file))].sort()
  /** Each file is listed once, under the most specific directory that holds it, best groups first. */
  const layout = () => {
    const owner = new Map<string, DirectoryCandidate>()
    for (const c of cands)
      for (const f of filesOf(c)) {
        const cur = owner.get(f)
        if (!cur || c.path.length > cur.path.length) owner.set(f, c)
      }
    const own = new Map<DirectoryCandidate, string[]>()
    for (const [f, c] of owner) own.set(c, [...(own.get(c) ?? []), f])
    const rank = { recommended: 0, potential: 1, "not-recommended": 2 }
    const list = [...own]
      .map(([c, files]) => ({ c, files: files.sort() }))
      .sort((a, b) => rank[a.c.recommendation] - rank[b.c.recommendation] || (a.c.path < b.c.path ? -1 : 1))
    const byFile = new Map<string, DiscoveredComponent[]>()
    for (const c of cands)
      for (const k of c.components)
        if (!(byFile.get(k.file) ?? []).some((x) => x.name === k.name && x.line === k.line))
          byFile.set(k.file, [...(byFile.get(k.file) ?? []), k])
    return { list, byFile, files: [...owner.keys()].sort() }
  }

  // Which files are ticked. What the person decided before wins; otherwise a file is ticked when its directory is recommended.
  const ticked = new Set<string>()
  const seen = new Set<string>()
  const meet = (c: DirectoryCandidate, tickAll: boolean): void => {
    for (const f of filesOf(c)) {
      if (seen.has(f)) {
        if (tickAll) ticked.add(f)
        continue
      }
      seen.add(f)
      const was = statusFor(f, input.prior)
      if (tickAll || was === "approved" || (was === undefined && c.recommendation === "recommended"))
        ticked.add(f)
    }
  }
  for (const c of cands) meet(c, false)

  // A component counts once, however many of the groups it appears in.
  const count = (): { components: number; dirs: number } => {
    const { list, byFile } = layout()
    return {
      components: new Set([...ticked].flatMap((f) => (byFile.get(f) ?? []).map((k) => `${f}#${k.name}`)))
        .size,
      dirs: list.filter((g) => g.files.some((f) => ticked.has(f))).length
    }
  }
  const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

  const pickIndex = async (question: string): Promise<DirectoryCandidate | undefined> => {
    const list = layout().list.map((g) => g.c)
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

  const selectComponents = async (): Promise<boolean> => {
    const { list, byFile, files } = layout()
    const question = "Which components are your design system's?"
    if (io.tree) {
      const folded = files.length + list.length > FOLD_ABOVE
      const picked = await io.tree(
        question,
        list.map((g) => ({
          label: label(g.c, prior, multi),
          collapsed: folded,
          items: g.files.map((f) => ({
            value: f,
            label: itemLabel(f, byFile.get(f) ?? [], g.c.path),
            ticked: ticked.has(f)
          }))
        }))
      )
      if (picked === undefined) return false
      const on = new Set(picked)
      for (const f of files) {
        if (on.has(f)) ticked.add(f)
        else ticked.delete(f)
      }
      return true
    }
    ui.say(`${question} A source file's components are chosen together.`)
    const numbered: string[] = []
    for (const g of list) {
      ui.say(label(g.c, prior, multi))
      for (const f of g.files) {
        numbered.push(f)
        ui.say(
          `  ${numbered.length}. [${ticked.has(f) ? "x" : " "}] ${itemLabel(f, byFile.get(f) ?? [], g.c.path)}`
        )
      }
    }
    const a = (
      await ask("Enter keeps the [x] ones, a ticks all, n clears, numbers or ranges (like 2,5-9) toggle: ")
    ).toLowerCase()
    for (const t of a.split(/[,\s]+/).filter(Boolean)) {
      const range = /^(\d+)(?:-(\d+))?$/.exec(t)
      if (t === "a" || t === "all") for (const f of numbered) ticked.add(f)
      else if (t === "n" || t === "none") for (const f of numbered) ticked.delete(f)
      else if (range)
        for (let i = Number(range[1]); i <= Number(range[2] ?? range[1]); i++) {
          const f = numbered[i - 1]
          if (f !== undefined && !ticked.delete(f)) ticked.add(f)
        }
    }
    return true
  }

  const first = count()
  ui.say(
    `${plural(layout().files.length, "source file", "source files")} hold${layout().files.length === 1 ? "s" : ""} ${plural(
      new Set([...layout().byFile].flatMap(([f, ks]) => ks.map((k) => `${f}#${k.name}`))).size,
      "potential component",
      "potential components"
    )}; ${first.components} start ticked.`
  )
  if (cands.length === 0)
    ui.say(
      'The scan found no component to choose from. Add a directory with "add" (a path from the project root).'
    )
  else if (!(await selectComponents()) || closed) return undefined
  for (;;) {
    const n = count()
    type Next = "confirm" | "add" | "view" | "evidence" | "select" | "agent"
    const summary = `${plural(n.components, "component", "components")} in ${plural(n.dirs, "directory", "directories")}`
    let next: Next | undefined
    if (io.select) {
      next = await io.select<Next>("Next?", [
        { value: "confirm", label: `Confirm: ${summary}`, key: "c" },
        { value: "select", label: "Change which components are ticked", key: "s" },
        { value: "add", label: "Add a directory or component file", key: "a" },
        ...(input.askAgent ? [{ value: "agent" as Next, label: input.askAgent.label, key: "h" }] : []),
        { value: "view", label: "View the components in a directory", key: "v" },
        { value: "evidence", label: "Inspect discovery evidence", key: "e" }
      ])
      if (next === undefined) return undefined
    } else {
      const a = (
        await ask(
          `${summary}. [c]onfirm, [a]dd, [v]iew, [e]vidence, [s]elect again, ${input.askAgent ? "[h]elp from an AI agent, " : ""}[q]uit (Enter confirms): `
        )
      ).toLowerCase()
      if (closed || a.startsWith("q")) return undefined
      next = a.startsWith("a")
        ? "add"
        : a.startsWith("h") && input.askAgent
          ? "agent"
          : a.startsWith("v")
            ? "view"
            : a.startsWith("e")
              ? "evidence"
              : a.startsWith("s")
                ? "select"
                : "confirm"
    }
    if (next === "confirm") {
      if (n.components === 0) {
        ui.flag(
          "nothing is selected, so there would be no component source. Tick a component or add a directory."
        )
        continue
      }
      break
    }
    if (next === "select") await selectComponents()
    else if (next === "agent") {
      const got = await input.askAgent?.run(cands)
      if (got === "stopped") return undefined
      if (got) {
        cands.splice(0, cands.length, ...got)
        for (const c of got) meet(c, c.suggestion !== undefined && c.recommendation === "recommended")
      }
    } else if (next === "view" || next === "evidence") {
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
        meet(r.candidate, true)
        ui.say(
          `added ${r.candidate.path}: ${r.candidate.componentCount} component${r.candidate.componentCount === 1 ? "" : "s"}`
        )
      }
    }
  }
  const { list, files } = layout()
  const own = new Map(list.map((g) => [g.c, g.files]))
  const groups = cands.map((c) => {
    const user = added.has(c.path)
    const agent = !user && c.foundBy === "agent"
    return {
      entry: {
        path: c.path,
        type: added.get(c.path) ?? ("directory" as const),
        source: user ? ("user" as const) : agent ? ("agent" as const) : ("discovered" as const),
        status: "excluded" as const,
        // Where an AI agent had a say, the saved decision keeps who, how sure it was and why.
        ...(c.suggestion && !user
          ? {
              note: `${agent ? "" : "also "}suggested by ${c.suggestion.by} (${c.suggestion.confidence} confidence): ${c.suggestion.reason}`.slice(
                0,
                600
              )
            }
          : {})
      },
      own: own.get(c) ?? [],
      all: filesOf(c),
      weak: c.recommendation === "not-recommended"
    }
  })
  return {
    decisions: decisionsFromSelection({ prior: input.prior, groups, files, ticked }),
    candidates: cands
  }
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
