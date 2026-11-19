import path from "node:path"
import { discoverProject, nodeFs } from "@invariant/compiler-core"

/** A path inside the project, as a posix relative path, or undefined when it leaves the project. */
export function inside(cwd: string, p: string): string | undefined {
  const rel = path.relative(cwd, path.resolve(cwd, p)).split(path.sep).join("/")
  return rel === "" ? "." : rel.startsWith("..") || path.isAbsolute(rel) ? undefined : rel
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
