import { posix } from "node:path"
import { detectAngularComponents } from "@invariant/compiler-angular"
import { type DetectedComponent, moduleSpecifiers } from "@invariant/compiler-core"
import { detectReactComponents } from "@invariant/compiler-react"
import { detectVueComponents } from "@invariant/compiler-vue"
import {
  type Confidence,
  confidenceOf,
  type Evidence,
  type PackageRole,
  type ProjectRecognition
} from "./recognize.js"
import { MAX_FILE_BYTES, NOT_DECLARATION, type Scan, SOURCE_FILE, scan } from "./scan.js"

export type Strategy = "component-library" | "application"
export type ComponentCategory =
  | "foundation"
  | "primitive"
  | "composite"
  | "layout"
  | "pattern"
  | "feature"
  | "template"
  | "unknown"
export interface Thresholds {
  high: number
  medium: number
}
export const DEFAULT_THRESHOLDS: Thresholds = { high: 80, medium: 50 }

export interface DiscoveredComponent extends DetectedComponent {
  category: ComponentCategory
  /** Exported by the package's public entry points. */
  public: boolean
  stories: boolean
  tests: boolean
  tokens: boolean
  accessible: boolean
  /** Why it looks tied to one application, in words. */
  negatives: string[]
  /** Distinct feature areas that import it (application strategy only). */
  featureAreas: number
  importers: number
}

export interface DirectoryCandidate {
  path: string
  packageName?: string
  packageDir: string
  strategy: Strategy
  components: DiscoveredComponent[]
  componentCount: number
  frameworks: string[]
  classification: { confidence: Confidence; score: number; category?: string; evidence: Evidence[] }
  recommendation: "recommended" | "potential" | "not-recommended"
}

export interface DiscoveryOutput {
  candidates: DirectoryCandidate[]
  diagnostics: string[]
  filesScanned: number
}

const COMPONENT_ROOTS = new Set([
  "components",
  "ui",
  "lib",
  "shared",
  "common",
  "design-system",
  "primitives",
  "composites"
])
const FEATURE_DIRS = new Set(["pages", "routes", "screens", "features", "modules", "views", "app", "apps"])
const EXAMPLE_DIR =
  /(^|\/)(examples?|demos?|docs?|playground|sandbox|__fixtures__|fixtures|templates-demo)(\/|$)/i
const PRIMITIVES = new Set([
  "button",
  "icon",
  "input",
  "textfield",
  "checkbox",
  "radio",
  "switch",
  "badge",
  "avatar",
  "link",
  "text",
  "typography",
  "divider",
  "label",
  "spinner"
])
const COMPOSITES = new Set([
  "select",
  "dialog",
  "modal",
  "datepicker",
  "datatable",
  "table",
  "tabs",
  "menu",
  "card",
  "tooltip",
  "popover",
  "dropdown",
  "accordion",
  "combobox"
])
const LAYOUTS = new Set([
  "stack",
  "grid",
  "container",
  "box",
  "flex",
  "row",
  "column",
  "layout",
  "shell",
  "page"
])

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "")
const baseKey = (file: string): string =>
  norm(
    posix
      .basename(file)
      .replace(/\.(stories|test|spec)\.[a-z]+$/i, "")
      .replace(/\.component\.ts$/i, "")
      .replace(/\.[a-z]+$/i, "")
  )

export function categoryOf(c: Pick<DetectedComponent, "name" | "file">): ComponentCategory {
  const segs = c.file.toLowerCase().split("/")
  const name = norm(c.name.replace(/Component$/, ""))
  const has = (...words: string[]): boolean => segs.some((s) => words.includes(s))
  if (has("foundations", "foundation", "tokens", "theme", "typography")) return "foundation"
  if (has("primitives", "primitive")) return "primitive"
  if (has("composites", "composite")) return "composite"
  if (has("patterns", "pattern")) return "pattern"
  if (has("layout", "layouts")) return "layout"
  if (has("templates", "template")) return "template"
  if (has("features", "modules", "pages", "routes", "screens", "views")) return "feature"
  if (PRIMITIVES.has(name)) return "primitive"
  if (COMPOSITES.has(name)) return "composite"
  if (LAYOUTS.has(name)) return "layout"
  return "unknown"
}

function detect(file: string, text: string): DetectedComponent[] {
  if (/\.(tsx|jsx)$/i.test(file))
    return [...detectReactComponents(file, text), ...detectVueComponents(file, text)]
  if (/\.vue$/i.test(file)) return detectVueComponents(file, text)
  if (/\.ts$/i.test(file)) return [...detectAngularComponents(file, text), ...detectVueComponents(file, text)]
  return detectVueComponents(file, text)
}

const SERVICE_IMPORT =
  /(^|\/)(services?|api|apis|store|stores|queries|graphql|repositories|repository)(\/|$)/i
const MODEL_IMPORT = /(^|\/)(models?|domain|entities|dto|dtos)(\/|$)/i
const API_TEXT = /\b(useQuery|useMutation|useSWR|axios|HttpClient|fetch)\s*[(<.]/
const ROUTING_TEXT =
  /\b(useNavigate|useRouter|useParams|useLocation|ActivatedRoute|Router|routerLink|RouterLink|useRoute)\b/
const TOKEN_TEXT = /var\(\s*--|\btokens?\b.*from|from\s+["'][^"']*(tokens?|theme)[^"']*["']/i
const A11Y_TEXT = /\baria-[a-z]+|\brole\s*[=:]|\btabIndex\b|\bkeydown\b/i

export interface AnalyzeInput {
  cwd: string
  recognition: ProjectRecognition
  /** The package whose context applies. Absent for a path outside any package. */
  role: PackageRole | undefined
  strategy: Strategy
  /** Limits the scan to this project-relative directory or file. */
  within?: string
}

/** Finds the components under one package (or one path) and gathers the facts the scoring reads. Reads files only. */
export async function analyzeComponents(
  input: AnalyzeInput,
  shared?: Scan
): Promise<{ components: DiscoveredComponent[]; filesScanned: number; diagnostics: string[] }> {
  const { role, strategy } = input
  const dir = role?.dir ?? "."
  const s = shared ?? (await scan(input.cwd))
  const diagnostics: string[] = []
  if (s.truncated)
    diagnostics.push("the project has more files than discovery reads, so the results may be incomplete")
  const pkgPrefix = dir === "." ? "" : `${dir}/`
  const inPackage = s.files.filter(
    (f) => f.startsWith(pkgPrefix) && !(dir === "." && f.startsWith("node_modules/"))
  )
  const sources = inPackage.filter((f) => SOURCE_FILE.test(f) || /\.vue$/i.test(f))
  const target = (f: string): boolean =>
    input.within === undefined || f === input.within || f.startsWith(`${input.within.replace(/\/$/, "")}/`)
  const texts = new Map<string, string>()
  const read = async (f: string): Promise<string | undefined> => {
    if (texts.has(f)) return texts.get(f)
    try {
      const t = await s.fs.readFile(f)
      if (t.length > MAX_FILE_BYTES) {
        diagnostics.push(`${f} is larger than ${MAX_FILE_BYTES / 1024} KB and was not read`)
        return undefined
      }
      texts.set(f, t)
      return t
    } catch {
      diagnostics.push(`${f} could not be read`)
      return undefined
    }
  }
  const info = input.recognition.project.packages.find((p) => p.dir === dir)
  const publicNames = new Set(
    info?.entryPoints.flatMap((e) => e.exports.filter((x) => !x.typeOnly).map((x) => x.name)) ?? []
  )
  const storyKeys = new Set(inPackage.filter((f) => /\.stories\./i.test(f)).map(baseKey))
  const testKeys = new Set(inPackage.filter((f) => /\.(test|spec)\./i.test(f)).map(baseKey))
  const found: DetectedComponent[] = []
  for (const f of sources) {
    if (NOT_DECLARATION.test(f) || !target(f)) continue
    const text = await read(f)
    if (text !== undefined) found.push(...detect(f, text))
  }
  // Application strategy: who imports each component file, by feature area.
  const importers = new Map<string, Set<string>>()
  if (strategy === "application" && found.length > 0) {
    const fileSet = new Set(sources)
    const resolve = (from: string, spec: string): string | undefined => {
      const base = spec.startsWith(".")
        ? posix.normalize(posix.join(posix.dirname(from), spec))
        : /^[@~]\//.test(spec)
          ? posix.join(pkgPrefix, "src", spec.slice(2))
          : undefined
      if (!base) return undefined
      for (const cand of [
        base,
        ...[".tsx", ".ts", ".jsx", ".js", ".vue"].map((e) => base + e),
        ...[".tsx", ".ts", ".jsx", ".js"].map((e) => `${base}/index${e}`)
      ])
        if (fileSet.has(cand)) return cand
      return undefined
    }
    const byDir = new Map<string, string[]>()
    for (const c of found)
      byDir.set(posix.dirname(c.file), [...(byDir.get(posix.dirname(c.file)) ?? []), c.file])
    for (const f of sources) {
      if (NOT_DECLARATION.test(f)) continue
      const text = await read(f)
      if (text === undefined) continue
      const area = featureArea(f, dir)
      for (const spec of moduleSpecifiers(text)) {
        const to = resolve(f, spec)
        if (!to || to === f) continue
        const targets = /\/index\.[jt]sx?$/.test(to) ? [to, ...(byDir.get(posix.dirname(to)) ?? [])] : [to]
        for (const t of targets) importers.set(t, (importers.get(t) ?? new Set()).add(`${area}\u0000${f}`))
      }
    }
  }
  const siblingStyle = async (f: string): Promise<string> => {
    const stem = f.replace(/\.[a-z]+$/i, "")
    for (const ext of [".css", ".scss", ".module.css", ".module.scss", ".less"])
      if (inPackage.includes(stem + ext)) return (await read(stem + ext)) ?? ""
    return ""
  }
  const out: DiscoveredComponent[] = []
  for (const c of found) {
    const text = texts.get(c.file) ?? ""
    const negatives: string[] = []
    const specs = moduleSpecifiers(text)
    if (specs.some((x) => SERVICE_IMPORT.test(x))) negatives.push("imports application services or stores")
    if (specs.some((x) => MODEL_IMPORT.test(x))) negatives.push("imports domain models")
    if (API_TEXT.test(text)) negatives.push("contains API queries or mutations")
    if (ROUTING_TEXT.test(text)) negatives.push("uses routing")
    const here = importers.get(c.file)
    const areas = new Set([...(here ?? [])].map((x) => x.split("\u0000")[0]))
    const keys = [norm(c.name), norm(c.name.replace(/Component$/, "")), baseKey(c.file)]
    out.push({
      ...c,
      category: categoryOf(c),
      public: publicNames.has(c.name),
      stories: keys.some((k) => storyKeys.has(k)),
      tests: keys.some((k) => testKeys.has(k)),
      tokens: TOKEN_TEXT.test(text) || /var\(\s*--/.test(await siblingStyle(c.file)),
      accessible: A11Y_TEXT.test(text),
      negatives,
      featureAreas: areas.size,
      importers: here?.size ?? 0
    })
  }
  return { components: out, filesScanned: sources.length, diagnostics }
}

function featureArea(file: string, pkgDir: string): string {
  const rel = pkgDir === "." ? file : file.slice(pkgDir.length + 1)
  const seg = rel.split("/")
  const at = seg.findIndex((x) => FEATURE_DIRS.has(x))
  if (at >= 0) return seg[at + 1] && seg.length > at + 2 ? (seg[at + 1] ?? "") : (seg[at] ?? "")
  if (seg[0] === "src") return seg.length > 2 ? (seg[1] ?? "src") : "src"
  return seg.length > 1 ? (seg[0] ?? ".") : "."
}

/** The directory a component belongs to: its folder, or that folder's parent when the folder is named for it. */
export function componentRoot(c: Pick<DetectedComponent, "name" | "file">): string {
  const dir = posix.dirname(c.file)
  const own = norm(posix.basename(dir))
  const keys = new Set([norm(c.name), norm(c.name.replace(/Component$/, "")), baseKey(c.file)])
  return dir !== "." && own !== "" && keys.has(own) ? posix.dirname(dir) : dir
}

/** Groups components into directories: a folder named for its component rolls up, nested roots merge, siblings under a known root merge. */
export function groupDirectories(
  components: readonly DiscoveredComponent[]
): Map<string, DiscoveredComponent[]> {
  let roots = new Map<string, DiscoveredComponent[]>()
  for (const c of components) {
    const r = componentRoot(c)
    roots.set(r, [...(roots.get(r) ?? []), c])
  }
  for (let changed = true; changed; ) {
    changed = false
    const keys = [...roots.keys()].sort((a, b) => b.length - a.length)
    for (const k of keys) {
      const parent = keys.find((o) => o !== k && (o === "." || k.startsWith(`${o}/`)))
      if (parent !== undefined && roots.has(k) && roots.has(parent)) {
        roots.set(parent, [...(roots.get(parent) ?? []), ...(roots.get(k) ?? [])])
        roots.delete(k)
        changed = true
      }
    }
    const byParent = new Map<string, string[]>()
    for (const k of roots.keys())
      byParent.set(posix.dirname(k), [...(byParent.get(posix.dirname(k)) ?? []), k])
    for (const [parent, kids] of byParent) {
      if (kids.length < 2 || !COMPONENT_ROOTS.has(posix.basename(parent)) || roots.has(parent)) continue
      roots.set(
        parent,
        kids.flatMap((k) => roots.get(k) ?? [])
      )
      for (const k of kids) roots.delete(k)
      changed = true
    }
  }
  roots = new Map([...roots].sort(([a], [b]) => (a < b ? -1 : 1)))
  return roots
}

const FAMILY_CAP: Record<Strategy, Record<string, number>> = {
  "component-library": { placement: 45, publicness: 25, documentation: 20, usage: 0, api: 20 },
  application: { placement: 15, publicness: 25, documentation: 20, usage: 20, api: 20 }
}

/** Scores one directory. Positive signals are grouped in families that cap what correlated signals can add. */
export function scoreDirectory(
  path: string,
  components: readonly DiscoveredComponent[],
  strategy: Strategy,
  role: PackageRole | undefined,
  thresholds: Thresholds
): DirectoryCandidate["classification"] & { recommendation: DirectoryCandidate["recommendation"] } {
  const n = components.length
  const share = (p: (c: DiscoveredComponent) => boolean): number =>
    components.filter(p).length / Math.max(1, n)
  const count = (p: (c: DiscoveredComponent) => boolean): number => components.filter(p).length
  const lib = strategy === "component-library"
  const evidence: Evidence[] = []
  const familyUsed: Record<string, number> = {}
  const positive = (family: string, signal: string, weight: number, detail: string): void => {
    if (weight <= 0) return
    const cap = FAMILY_CAP[strategy][family] ?? 0
    const room = Math.max(0, cap - (familyUsed[family] ?? 0))
    const w = Math.round(Math.min(weight, room))
    if (w <= 0) return
    familyUsed[family] = (familyUsed[family] ?? 0) + w
    evidence.push({
      signal,
      weight: w,
      detail: w < Math.round(weight) ? `${detail} (limited: it overlaps other signals)` : detail
    })
  }
  const negative = (signal: string, weight: number, detail: string): void => {
    evidence.push({ signal, weight: -Math.round(weight), detail })
  }
  // Folder names count only inside the package: a repository kept under `demo/` or `apps/` says nothing about its parts.
  const inside =
    role && role.dir !== "." && path.startsWith(`${role.dir}/`)
      ? path.slice(role.dir.length + 1)
      : path === role?.dir
        ? ""
        : path
  const segs = inside.split("/")
  if (lib && role)
    positive(
      "placement",
      "design-system-package",
      30,
      `${role.name ?? role.dir} is a recognized design-system package (${role.confidence} confidence)`
    )
  const shared = segs.filter((s) => COMPONENT_ROOTS.has(s))
  if (shared.length > 0)
    positive(
      "placement",
      "shared-directory",
      15,
      `${path} is a shared component directory (${shared.at(-1)})`
    )
  positive(
    "publicness",
    "public-export",
    25 * share((c) => c.public),
    `${count((c) => c.public)} of ${n} are exported through the package entry points`
  )
  positive(
    "documentation",
    "stories",
    20 * share((c) => c.stories),
    `Storybook stories found for ${count((c) => c.stories)} of ${n}`
  )
  positive(
    "documentation",
    "tests",
    5 * share((c) => c.tests),
    `${count((c) => c.tests)} of ${n} have their own tests`
  )
  if (!lib) {
    positive(
      "usage",
      "cross-feature-use",
      20 * share((c) => c.featureAreas >= 3),
      `${count((c) => c.featureAreas >= 3)} of ${n} are imported from 3 or more feature areas`
    )
  }
  positive(
    "api",
    "typed-api",
    10 * share((c) => c.typedApi),
    `${count((c) => c.typedApi)} of ${n} declare a typed or configurable API`
  )
  positive(
    "api",
    "tokens",
    10 * share((c) => c.tokens),
    `${count((c) => c.tokens)} of ${n} use shared design tokens`
  )
  positive(
    "api",
    "accessibility",
    5 * share((c) => c.accessible),
    `${count((c) => c.accessible)} of ${n} set accessibility attributes`
  )
  const neg = (flag: string, signal: string, weight: number, label: string): void => {
    const k = count((c) => c.negatives.includes(flag))
    if (k > 0) negative(signal, weight * (k / n), `${k} of ${n} ${label}`)
  }
  neg(
    "imports application services or stores",
    "application-services",
    20,
    "import application services or stores"
  )
  neg("imports domain models", "domain-models", 15, "import domain models")
  neg("contains API queries or mutations", "business-api", 15, "contain API queries or mutations")
  neg("uses routing", "routing", 10, "use routing")
  const example = EXAMPLE_DIR.test(inside)
  const featureDir = segs.some((s) => FEATURE_DIRS.has(s))
  if (example) negative("examples", 45, `${path} looks like examples, demos or documentation`)
  if (featureDir)
    negative(
      "feature-directory",
      lib ? 30 : 10,
      `${path} is under an application folder (${segs.find((s) => FEATURE_DIRS.has(s))})`
    )
  if (!lib) {
    const own = count((c) => c.importers > 0 && c.featureAreas === 1)
    if (own > 0)
      negative("single-feature", 10 * (own / n), `${own} of ${n} are only used within one feature area`)
    const unused = count((c) => !c.public && c.importers === 0)
    if (unused > 0)
      negative(
        "no-consumers",
        5 * (unused / n),
        `${unused} of ${n} are neither exported nor imported anywhere`
      )
  }
  const raw = evidence.reduce((sum, e) => sum + e.weight, 0)
  let score = Math.max(0, Math.min(100, Math.round(raw)))
  const families = Object.entries(familyUsed).filter(([, w]) => w > 0).length
  if (score >= thresholds.high && families < 2) {
    score = thresholds.high - 1
    evidence.push({
      signal: "independent-evidence",
      weight: 0,
      detail: "held below high confidence: it needs independent evidence from at least two kinds of signal"
    })
  }
  const confidence = confidenceOf(score, thresholds.high, thresholds.medium)
  let recommendation: DirectoryCandidate["recommendation"] =
    score >= thresholds.medium ? "recommended" : score >= 30 ? "potential" : "not-recommended"
  if (example) recommendation = n > 0 ? "potential" : "not-recommended"
  else if (!lib && featureDir && recommendation === "recommended" && confidence !== "high")
    recommendation = "potential"
  const cats = new Map<string, number>()
  for (const c of components) cats.set(c.category, (cats.get(c.category) ?? 0) + 1)
  const top = [...cats]
    .filter(([k]) => k !== "unknown")
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0]
  return {
    confidence,
    score,
    ...(example ? { category: "examples" } : top ? { category: top } : {}),
    evidence,
    recommendation
  }
}

/** Builds the reviewed candidates for the selected packages, each with the strategy its package calls for. */
export async function discoverSources(
  cwd: string,
  recognition: ProjectRecognition,
  packages: readonly PackageRole[],
  thresholds: Thresholds = DEFAULT_THRESHOLDS
): Promise<DiscoveryOutput> {
  const shared = await scan(cwd)
  const candidates: DirectoryCandidate[] = []
  const diagnostics: string[] = []
  let filesScanned = 0
  for (const role of packages) {
    const strategy: Strategy = role.role === "design-system" ? "component-library" : "application"
    const r = await analyzeComponents({ cwd, recognition, role, strategy }, shared)
    filesScanned += r.filesScanned
    diagnostics.push(...r.diagnostics)
    for (const [dirPath, components] of groupDirectories(r.components)) {
      const c = scoreDirectory(dirPath, components, strategy, role, thresholds)
      candidates.push({
        path: dirPath,
        ...(role.name ? { packageName: role.name } : {}),
        packageDir: role.dir,
        strategy,
        components: [...components].sort((a, b) =>
          a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1
        ),
        componentCount: components.length,
        frameworks: [...new Set(components.map((x) => x.framework))].sort(),
        classification: {
          confidence: c.confidence,
          score: c.score,
          ...(c.category ? { category: c.category } : {}),
          evidence: c.evidence
        },
        recommendation: c.recommendation
      })
    }
  }
  candidates.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return { candidates, diagnostics: [...new Set(diagnostics)].sort(), filesScanned }
}

/** Analyzes a path the person added (a directory or one component file) with the context of the package that holds it. */
export async function analyzePath(
  cwd: string,
  recognition: ProjectRecognition,
  rel: string,
  thresholds: Thresholds = DEFAULT_THRESHOLDS
): Promise<{ candidate: DirectoryCandidate; diagnostics: string[] } | undefined> {
  const role = [...recognition.packages]
    .filter((p) => p.dir === "." || rel === p.dir || rel.startsWith(`${p.dir}/`))
    .sort((a, b) => b.dir.length - a.dir.length)[0]
  const strategy: Strategy = role?.role === "design-system" ? "component-library" : "application"
  const r = await analyzeComponents({ cwd, recognition, role, strategy, within: rel })
  if (r.components.length === 0) return undefined
  const c = scoreDirectory(rel, r.components, strategy, role, thresholds)
  return {
    candidate: {
      path: rel,
      ...(role?.name ? { packageName: role.name } : {}),
      packageDir: role?.dir ?? ".",
      strategy,
      components: r.components,
      componentCount: r.components.length,
      frameworks: [...new Set(r.components.map((x) => x.framework))].sort(),
      classification: {
        confidence: c.confidence,
        score: c.score,
        ...(c.category ? { category: c.category } : {}),
        evidence: c.evidence
      },
      recommendation: c.recommendation
    },
    diagnostics: r.diagnostics
  }
}
