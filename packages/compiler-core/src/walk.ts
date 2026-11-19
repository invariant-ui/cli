import type { ReadonlyFs } from "./fs.js"

export const DEFAULT_IGNORED_DIRS: readonly string[] = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  ".angular",
  ".svelte-kit",
  ".output",
  ".pnpm-store",
  "storybook-static"
]

export interface WalkResult {
  /** Every file path, sorted. */
  files: string[]
  /** Directories read, the start directory included. */
  directories: number
  truncated: boolean
}

export interface WalkOptions {
  ignoreDirs: ReadonlySet<string>
  /** Stops after this many files. Pass `Number.POSITIVE_INFINITY` to read everything. */
  maxFiles: number
  start?: string
  /** Skips a directory by its project-relative path, for rules a name alone cannot express. */
  skip?: (dir: string) => boolean
  /** Called after each directory is read, with the running totals. */
  onProgress?: (progress: { files: number; directories: number }) => void
}

/**
 * Deterministic walk: sorted traversal, ignored directories skipped, symlinks never followed.
 * Stops at `maxFiles` and reports truncation rather than silently returning a partial list.
 */
export async function walk(fs: ReadonlyFs, options: WalkOptions): Promise<WalkResult> {
  const files: string[] = []
  let directories = 0
  let truncated = false
  const visit = async (dir: string): Promise<void> => {
    directories++
    const entries = await fs.readDir(dir)
    options.onProgress?.({ files: files.length, directories })
    for (const entry of entries) {
      if (truncated) return
      const child = dir === "." ? entry.name : `${dir}/${entry.name}`
      if (entry.kind === "dir") {
        if (!options.ignoreDirs.has(entry.name) && !options.skip?.(child)) await visit(child)
      } else if (entry.kind === "file") {
        if (files.length >= options.maxFiles) {
          truncated = true
          return
        }
        files.push(child)
      }
    }
  }
  await visit(options.start ?? ".")
  return { files: files.sort(), directories, truncated }
}
