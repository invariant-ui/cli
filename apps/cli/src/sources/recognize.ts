import { discoverProject, type ProjectDiscovery } from "@invariant/compiler-core"
import { scan } from "./scan.js"

export const ROLES = ["design-system", "application", "tokens", "icons", "utility", "unknown"] as const
export type PackageRoleName = (typeof ROLES)[number]
export type Confidence = "high" | "medium" | "low"

/** One reason for a score. Weights are signed: a negative one counted against. */
export interface Evidence {
  signal: string
  weight: number
  detail: string
}

export interface PackageRole {
  name?: string
  dir: string
  role: PackageRoleName
  /** How strongly the package looks like a UI library, 0 to 100. A heuristic, not a probability. */
  score: number
  confidence: Confidence
  frameworks: string[]
  /** Workspace packages that depend on this one. */
  consumers: string[]
  evidence: Evidence[]
  /** The package's own description from its manifest. */
  description?: string
}

export interface ProjectRecognition {
  kind: "component-library" | "application" | "monorepo" | "unknown"
  monorepo: boolean
  packages: PackageRole[]
  project: ProjectDiscovery
}

export const confidenceOf = (score: number, high = 80, medium = 50): Confidence =>
  score >= high ? "high" : score >= medium ? "medium" : "low"

const FRAMEWORK_PEERS = /^(react|vue|@angular\/core|preact|solid-js|svelte)$/
const UI_NAME = /(^|[/@_-])(ui|components?|design-?system|ds|kit|primitives|widgets)($|[/_-])/i
const UI_DESCRIPTION =
  /(component library|design system|ui (kit|library)|react components|vue components|angular components|reusable components)/i
const TOKENS_NAME = /(^|[/@_-])(tokens?|theme|themes|styles)($|[/_-])/i
const ICONS_NAME = /(^|[/@_-])icons?($|[/_-])/i
const APP_DIRS = ["pages", "routes", "screens", "features", "modules", "views", "app"]
const LIB_DIRS = ["components", "ui", "primitives", "composites", "layout", "foundations"]

/**
 * Reads the project's structure (workspaces, packages, manifests, directories) and decides what each package is. Several
 * independent signals add up to a design-system score; no one signal decides. A package the person named in
 * `discovery.packages` keeps the role they gave it (`explicit`).
 */
export async function recognizeProject(
  cwd: string,
  explicit: ReadonlyArray<{ path: string; role: PackageRoleName }> = []
): Promise<ProjectRecognition> {
  const { fs, files } = await scan(cwd)
  const project = await discoverProject({ fs })
  const dirsOf = (dir: string): Set<string> => {
    const out = new Set<string>()
    const prefix = dir === "." ? "" : `${dir}/`
    for (const f of files) {
      if (!f.startsWith(prefix)) continue
      const rest = f.slice(prefix.length).split("/")
      if (rest.length > 1) out.add(rest[0] ?? "")
      if (rest[0] === "src" && rest.length > 2) out.add(rest[1] ?? "")
      if (rest[0] === "src" && rest[1] === "lib" && rest.length > 3) out.add(rest[2] ?? "")
    }
    return out
  }
  const workspace = project.workspaces.kind !== "none"
  const pkgs = project.packages.filter((p) => !(p.dir === "." && workspace && project.packages.length > 1))
  const manifestOf = async (dir: string): Promise<{ description?: string; main?: string }> => {
    try {
      return JSON.parse(await fs.readFile(dir === "." ? "package.json" : `${dir}/package.json`)) as {
        description?: string
      }
    } catch {
      return {}
    }
  }
  const roles: PackageRole[] = []
  for (const pkg of pkgs) {
    const evidence: Evidence[] = []
    const add = (signal: string, weight: number, detail: string): void => {
      evidence.push({ signal, weight, detail })
    }
    const manifest = await manifestOf(pkg.dir)
    const dirs = dirsOf(pkg.dir)
    const consumers = project.packages
      .filter((o) => o.id !== pkg.id && pkg.name && o.dependencies.some((d) => d.name === pkg.name))
      .map((o) => o.name ?? o.dir)
      .sort()
    const peers = pkg.dependencies.filter(
      (d) => d.kind === "peerDependencies" && FRAMEWORK_PEERS.test(d.name)
    )
    if (pkg.name && UI_NAME.test(pkg.name))
      add("package-name", 15, `the name "${pkg.name}" says it is a UI library`)
    if (manifest.description && UI_DESCRIPTION.test(manifest.description))
      add("package-description", 10, `its description calls it a component library or design system`)
    if (peers.length > 0)
      add(
        "framework-peer",
        15,
        `${peers.map((d) => d.name).join(", ")} is a peer dependency, as in a library`
      )
    const exportsCount = pkg.entryPoints.reduce((n, e) => n + e.exports.filter((x) => !x.typeOnly).length, 0)
    if (pkg.entryPoints.length > 0)
      add(
        "public-entry",
        10,
        `it exposes ${pkg.entryPoints.length} entry point(s) other packages import from`
      )
    if (exportsCount >= 5) add("public-exports", 10, `${exportsCount} public exports`)
    const storybook = project.storybooks.some(
      (s) => s.directory === pkg.dir || s.directory.startsWith(pkg.dir === "." ? "" : `${pkg.dir}/`)
    )
    if (storybook || pkg.dependencies.some((d) => d.name.startsWith("@storybook/")))
      add("storybook", 10, "Storybook is configured for it")
    const libDirs = LIB_DIRS.filter((d) => dirs.has(d))
    if (libDirs.length > 0) add("source-structure", 10, `component folders: ${libDirs.join(", ")}`)
    if (consumers.length > 0) add("consumers", 10, `used by ${consumers.join(", ")}`)
    if (pkg.scripts.includes("build")) add("build", 5, "it has a build script, as a library does")
    if (project.tokenFiles.some((t) => t.package === pkg.name) || dirs.has("tokens") || dirs.has("styles"))
      add("tokens", 5, "it ships tokens or styles")
    // Application signals count against it being a library.
    const appDirs = APP_DIRS.filter((d) => dirs.has(d))
    if (appDirs.length > 0) add("application-structure", -10, `application folders: ${appDirs.join(", ")}`)
    if (pkg.scripts.some((s) => ["dev", "start", "serve"].includes(s)) && pkg.private)
      add("application-scripts", -10, "it is private and has a dev or start script")
    const libraryScore = Math.max(
      0,
      Math.min(
        100,
        evidence.reduce((n, e) => n + e.weight, 0)
      )
    )
    const forced = explicit.find((e) => e.path === pkg.dir)
    const nameKind =
      pkg.name && ICONS_NAME.test(pkg.name)
        ? "icons"
        : pkg.name && TOKENS_NAME.test(pkg.name)
          ? "tokens"
          : undefined
    const hasFramework = pkg.frameworks.length > 0
    let role: PackageRoleName
    if (forced) role = forced.role
    else if (nameKind && libraryScore < 80) role = nameKind
    else if (libraryScore >= 50 && libraryScore >= 50 + (appDirs.length > 0 ? 10 : 0)) role = "design-system"
    // A small library has no Storybook or consumers yet: a UI-sounding name, a framework peer dependency and an entry point are enough.
    else if (libraryScore >= 40 && peers.length > 0 && appDirs.length === 0) role = "design-system"
    else if (appDirs.length > 0 || (pkg.private && hasFramework)) role = "application"
    else role = hasFramework ? "unknown" : "utility"
    roles.push({
      ...(pkg.name ? { name: pkg.name } : {}),
      dir: pkg.dir,
      role,
      score: libraryScore,
      confidence: forced ? "high" : confidenceOf(libraryScore),
      frameworks: [...new Set(pkg.frameworks.map((f) => f.name))].sort(),
      consumers,
      evidence: forced
        ? [
            { signal: "configuration", weight: 0, detail: `set to ${forced.role} in discovery.packages` },
            ...evidence
          ]
        : evidence,
      ...(manifest.description ? { description: manifest.description } : {})
    })
  }
  roles.sort((a, b) => (a.dir < b.dir ? -1 : 1))
  const monorepo = workspace && roles.length > 1
  const libs = roles.filter((r) => r.role === "design-system")
  const kind: ProjectRecognition["kind"] = monorepo
    ? "monorepo"
    : libs.length > 0
      ? "component-library"
      : roles.some((r) => r.role === "application")
        ? "application"
        : "unknown"
  return { kind, monorepo, packages: roles, project }
}
