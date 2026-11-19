import {
  DEFAULT_IGNORED_DIRS,
  globToRegExp,
  nodeFs,
  type ReadonlyFs,
  type WalkOptions,
  walk
} from "@invariant/compiler-core"

export const MAX_FILE_BYTES = 512 * 1024

export interface Scan {
  fs: ReadonlyFs
  /** Project-relative POSIX paths, sorted, with ignored folders and `.gitignore`d files left out. */
  files: string[]
  /** Folders read. */
  directories: number
}

export interface IgnoreRule {
  re: RegExp
  /** A trailing slash in the `.gitignore`: it names folders only. */
  dirOnly: boolean
}

/**
 * The rules of a root `.gitignore`. A pattern with a slash in front or in the middle is anchored to the project root; one
 * without matches at any depth, as git does. Negations (`!`) and nested `.gitignore` files are not modeled, so the scan
 * may read more than git tracks, never less.
 */
export function gitignoreRules(text: string): IgnoreRule[] {
  const rules: IgnoreRule[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === "" || line.startsWith("#") || line.startsWith("!")) continue
    const dirOnly = line.endsWith("/")
    const body = line.replace(/\/+$/, "").replace(/^\//, "")
    if (body === "") continue
    const anchored = line.replace(/\/+$/, "").includes("/")
    try {
      rules.push({ re: globToRegExp(anchored ? body : `**/${body}`), dirOnly })
    } catch {
      // A pattern that is not a valid glob is left out: scanning more is safe, scanning less is not.
    }
  }
  return rules
}

/**
 * Reads every file under the project (or under `start`), without following symlinks. It skips `node_modules`, build
 * output and what the root `.gitignore` names, and nothing else: there is no limit on the number of files.
 */
export async function scan(cwd: string, start = ".", onProgress?: WalkOptions["onProgress"]): Promise<Scan> {
  const fs = nodeFs(cwd)
  const rules = (await fs.exists(".gitignore")) ? gitignoreRules(await fs.readFile(".gitignore")) : []
  const walked = await walk(fs, {
    ignoreDirs: new Set(DEFAULT_IGNORED_DIRS),
    maxFiles: Number.POSITIVE_INFINITY,
    start,
    skip: (dir) => rules.some((r) => r.re.test(dir)),
    ...(onProgress ? { onProgress } : {})
  })
  const files =
    rules.length > 0
      ? walked.files.filter((f) => !rules.some((r) => !r.dirOnly && r.re.test(f)))
      : walked.files
  return { fs, files, directories: walked.directories }
}

export const SOURCE_FILE = /\.(tsx|jsx|vue|ts|js)$/i
export const NOT_DECLARATION =
  /(\.d\.ts|\.stories\.[jt]sx?|\.stories\.mdx|\.test\.[jt]sx?|\.spec\.[jt]sx?|\.e2e\.[jt]sx?)$|(^|\/)(__tests__|__mocks__|__fixtures__|e2e)\//i
