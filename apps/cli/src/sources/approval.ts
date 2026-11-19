import path from "node:path"
import { type InvariantConfig, slug } from "../config.js"
import type { DirectoryCandidate } from "./discover.js"
import type { PackageRole, ProjectRecognition } from "./recognize.js"

export type ComponentSource = NonNullable<InvariantConfig["componentSources"]>[number]
type Source = InvariantConfig["sources"][number]

const trim = (p: string): string => p.replace(/^\.\//, "").replace(/\/+$/, "")
const under = (p: string, dir: string): boolean => dir === "." || p === dir || p.startsWith(`${dir}/`)

/** The set a later run starts from: what the person already decided. */
export const priorDecisions = (config: InvariantConfig | undefined): ComponentSource[] =>
  config?.componentSources ?? []

/**
 * One entry per path, sorted. A path decided twice keeps the last decision. An approved entry inside an approved
 * directory is redundant and dropped, unless an exclusion sits between them. A `pending` entry covered by an approved
 * directory is dropped. The result is deterministic, so repeated setups write the same file.
 */
export function normalizeSources(list: readonly ComponentSource[]): ComponentSource[] {
  const byPath = new Map<string, ComponentSource>()
  for (const s of list) byPath.set(trim(s.path), { ...s, path: trim(s.path) })
  const all = [...byPath.values()]
  const approvedDirs = all.filter((s) => s.status === "approved" && s.type === "directory")
  const excluded = all.filter((s) => s.status === "excluded")
  const kept = all.filter((s) => {
    const cover = approvedDirs.find((d) => d.path !== s.path && under(s.path, d.path))
    if (!cover) return true
    if (s.status === "pending") return false
    // What the person added by hand is kept even when a directory covers it: it records the choice, and it still
    // counts if the directory is later dropped.
    if (s.status === "approved")
      return s.source === "user" || excluded.some((x) => under(x.path, cover.path) && under(s.path, x.path))
    return true
  })
  return kept.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

/** What the most specific decision that covers a file says, or undefined when none does. `pending` is no decision. */
export function statusFor(
  file: string,
  sources: readonly ComponentSource[]
): "approved" | "excluded" | undefined {
  const covering = sources
    .filter((s) => s.status !== "pending" && (s.type === "file" ? file === s.path : under(file, s.path)))
    .sort((a, b) => b.path.length - a.path.length)
  const top = covering[0]?.status
  return top === "pending" ? undefined : top
}

/**
 * Whether a file counts. The most specific decision that covers it wins, so a file the person added inside an excluded
 * directory stays in, and a directory they excluded inside an approved one stays out. Without a decision it is out,
 * once anything is approved.
 */
export function inScope(file: string, sources: readonly ComponentSource[]): boolean {
  if (!sources.some((s) => s.status === "approved")) return true
  return statusFor(file, sources) === "approved"
}

export const hasApproved = (config: InvariantConfig | undefined): boolean =>
  (config?.componentSources ?? []).some((s) => s.status === "approved")

/**
 * What a later decision may do to the earlier ones. A `pending` entry never replaces a decision, so a rejected path is
 * not approved by a rerun and a user addition is not lost. A person's explicit answer replaces the earlier one.
 */
export function mergeDecisions(
  prior: readonly ComponentSource[],
  chosen: readonly ComponentSource[]
): ComponentSource[] {
  const all = new Map(prior.map((p) => [trim(p.path), p]))
  for (const c of chosen) {
    const key = trim(c.path)
    if (c.status === "pending" && all.has(key)) continue
    all.set(key, c)
  }
  return normalizeSources([...all.values()])
}

/** The compile sources the approved paths need: one per framework and package, at the package (what adapters read). */
export function sourcesFor(
  decisions: readonly ComponentSource[],
  recognition: ProjectRecognition,
  candidates: readonly DirectoryCandidate[]
): Source[] {
  const out = new Map<string, Source>()
  const roleFor = (p: string): PackageRole | undefined =>
    [...recognition.packages].filter((r) => under(p, r.dir)).sort((a, b) => b.dir.length - a.dir.length)[0]
  for (const d of decisions.filter((s) => s.status === "approved")) {
    const role = roleFor(d.path)
    const found = candidates.find(
      (c) => c.path === d.path || (d.type === "file" && c.components.some((x) => x.file === d.path))
    )
    const frameworks = found && found.frameworks.length > 0 ? found.frameworks : (role?.frameworks ?? [])
    for (const fw of frameworks) {
      const dir = role?.dir ?? "."
      const id = slug(
        `${role?.name ?? (dir === "." ? path.basename(recognition.project.packages[0]?.dir ?? "project") : dir)}-${fw}`
      )
      out.set(`${fw}:${dir}`, { id, type: fw as Source["type"], ...(dir === "." ? {} : { path: dir }) })
    }
  }
  const ids = new Set<string>()
  return [...out.values()].map((s) => {
    let id = s.id
    for (let n = 2; ids.has(id); n++) id = `${s.id}-${n}`
    ids.add(id)
    return { ...s, id }
  })
}

/**
 * Writes the person's decisions into the configuration without losing anything else in it. Framework sources are
 * regenerated from the approved paths; storybook, tokens and every other setting are kept as they were.
 */
export function applyDecisions(
  config: InvariantConfig,
  input: {
    decisions: readonly ComponentSource[]
    recognition: ProjectRecognition
    candidates: readonly DirectoryCandidate[]
    packages: readonly PackageRole[]
    extraSources?: readonly Source[]
  }
): InvariantConfig {
  const FRAMEWORKS = new Set(["react", "vue", "angular"])
  const generated = sourcesFor(input.decisions, input.recognition, input.candidates)
  // A framework source that reads an installed package (`declarations`) is not derived from the approved paths, so it stays.
  const keep = [...config.sources, ...(input.extraSources ?? [])].filter(
    (s) => !FRAMEWORKS.has(s.type) || s.declarations === true
  )
  const seen = new Set<string>()
  const sources = [...keep, ...generated].filter((s) => {
    const k = `${s.type}:${s.path ?? "."}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  const ids = new Set<string>()
  const unique = sources.map((s) => {
    let id = s.id
    for (let n = 2; ids.has(id); n++) id = `${s.id}-${n}`
    ids.add(id)
    return { ...s, id }
  })
  return {
    ...config,
    sources: unique,
    componentSources: normalizeSources(input.decisions),
    discovery: {
      ...config.discovery,
      mode: input.recognition.kind === "unknown" ? "application" : input.recognition.kind,
      packages: input.packages.map((p) => ({
        ...(p.name ? { name: p.name } : {}),
        path: p.dir,
        role: p.role
      }))
    }
  }
}

/**
 * The decisions that make exactly the ticked files count. Each group is a directory (or one file) the scan or the person
 * named; it is approved when most of the files shown under it are ticked, and excluded otherwise, and a weak group nobody
 * ticked and nobody decided before is left undecided so a large repository does not fill the file with rejections. A file
 * whose tick differs from what its directory says gets a decision of its own, which wins because it is more specific. The
 * result is checked against `statusFor`, so it holds for every file, whatever else was decided earlier.
 */
export function decisionsFromSelection(input: {
  prior: readonly ComponentSource[]
  groups: ReadonlyArray<{
    /** Path, type, source and note of the decision. `status` is worked out here. */
    entry: ComponentSource
    /** The files shown under this group. */
    own: readonly string[]
    /** Every file under it, including those shown under a group inside it. */
    all: readonly string[]
    weak: boolean
  }>
  files: readonly string[]
  ticked: ReadonlySet<string>
}): ComponentSource[] {
  const discovered = new Set(input.files)
  // The selection decides every file it lists, so an earlier decision about one of them is replaced, not kept beside it.
  const prior = input.prior.filter((p) => !(p.type === "file" && discovered.has(trim(p.path))))
  const decided = new Set(prior.map((p) => trim(p.path)))
  const dirs: ComponentSource[] = []
  for (const g of input.groups) {
    const basis = g.own.length > 0 ? g.own : g.all
    const on = basis.filter((f) => input.ticked.has(f)).length
    const approved = on > 0 && on * 2 >= basis.length
    if (approved || !g.weak || decided.has(trim(g.entry.path)))
      dirs.push({ ...g.entry, status: approved ? "approved" : "excluded" })
  }
  const base = mergeDecisions(prior, dirs)
  const own: ComponentSource[] = []
  for (const f of input.files) {
    const wanted = input.ticked.has(f)
    if (wanted !== (statusFor(f, base) === "approved"))
      own.push({ path: f, type: "file", source: "user", status: wanted ? "approved" : "excluded" })
  }
  return mergeDecisions(base, own)
}
