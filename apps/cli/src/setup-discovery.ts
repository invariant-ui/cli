import { existsSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { discoverProject, nodeFs } from "@invariant/compiler-core"
import { type InvariantConfig, slug } from "./config.js"

export type Source = InvariantConfig["sources"][number]

const SKIP = new Set(["node_modules", "dist", "build", ".git", "coverage", ".next", ".turbo"])
const FRAMEWORK_FILE: Array<[RegExp, "react" | "vue" | "angular"]> = [
  [/\.component\.ts$/, "angular"],
  [/\.vue$/, "vue"],
  [/(?<!\.(stories|test|spec))\.[jt]sx$/, "react"]
]

/** A path inside the project, as a posix relative path, or undefined when it leaves the project. */
export function inside(cwd: string, p: string): string | undefined {
  const rel = path.relative(cwd, path.resolve(cwd, p)).split(path.sep).join("/")
  return rel === "" ? "." : rel.startsWith("..") || path.isAbsolute(rel) ? undefined : rel
}

/** Looks at the file names under a folder (nothing is run or read) and says which framework's components it holds. */
export function inferSource(cwd: string, rel: string): { source: Source; files: number } | undefined {
  const root = path.join(cwd, rel)
  if (!existsSync(root) || !statSync(root).isDirectory()) return undefined
  const count = { react: 0, vue: 0, angular: 0 }
  const walk = (dir: string, depth: number): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (depth < 6 && !SKIP.has(e.name)) walk(path.join(dir, e.name), depth + 1)
      } else {
        const hit = FRAMEWORK_FILE.find(([re]) => re.test(e.name))
        if (hit) count[hit[1]]++
      }
    }
  }
  walk(root, 0)
  const [type, files] = (Object.entries(count) as Array<["react" | "vue" | "angular", number]>).sort(
    (a, b) => b[1] - a[1]
  )[0] ?? ["react", 0]
  if (files === 0) return undefined
  return { source: { id: slug(`${rel === "." ? "root" : rel}-${type}`), type, path: rel }, files }
}

/**
 * Folders and packages that import the confirmed component folders: workspace packages that depend on one, in
 * any monorepo layout. Empty when none does (the caller falls back to conventional folders).
 */
export async function findApps(cwd: string, sourcePaths: readonly string[]): Promise<string[]> {
  const project = await discoverProject({ fs: nodeFs(cwd) })
  const owned = new Set(sourcePaths.map((p) => p.replace(/^\.\//, "")))
  const names = new Set(
    project.packages.filter((p) => p.dir !== "." && owned.has(p.dir) && p.name).map((p) => p.name as string)
  )
  return project.packages
    .filter((p) => p.dir !== "." && !owned.has(p.dir) && p.dependencies.some((d) => names.has(d.name)))
    .map((p) => p.dir)
    .sort()
}
