import { DEFAULT_IGNORED_DIRS, globToRegExp, nodeFs, type ReadonlyFs, walk } from "@invariant/compiler-core"

const MAX_FILES = 20000
export const MAX_FILE_BYTES = 512 * 1024

export interface Scan {
  fs: ReadonlyFs
  /** Project-relative POSIX paths, sorted, with ignored folders and `.gitignore`d files left out. */
  files: string[]
  truncated: boolean
}

/** Directory names and file globs from a `.gitignore`. Negations and anchored subtrees are not modeled. */
export function gitignoreRules(text: string): { dirs: Set<string>; globs: RegExp[] } {
  const dirs = new Set<string>()
  const globs: RegExp[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === "" || line.startsWith("#") || line.startsWith("!")) continue
    const bare = line.replace(/^\//, "").replace(/\/$/, "")
    if (!/[*?[]/.test(bare) && (line.endsWith("/") || !bare.includes(".")))
      dirs.add(bare.split("/").pop() ?? bare)
    else globs.push(globToRegExp(bare.includes("/") ? bare : `**/${bare}`))
  }
  return { dirs, globs }
}

/** Reads the project's files without following symlinks, skipping `node_modules`, build output and ignored paths. */
export async function scan(cwd: string, start = "."): Promise<Scan> {
  const fs = nodeFs(cwd)
  const rules = (await fs.exists(".gitignore")) ? gitignoreRules(await fs.readFile(".gitignore")) : undefined
  const ignoreDirs = new Set([...DEFAULT_IGNORED_DIRS, ...(rules?.dirs ?? [])])
  const walked = await walk(fs, { ignoreDirs, maxFiles: MAX_FILES, start })
  const files = rules ? walked.files.filter((f) => !rules.globs.some((g) => g.test(f))) : walked.files
  return { fs, files, truncated: walked.truncated }
}

export const SOURCE_FILE = /\.(tsx|jsx|vue|ts|js)$/i
export const NOT_DECLARATION =
  /(\.d\.ts|\.stories\.[jt]sx?|\.stories\.mdx|\.test\.[jt]sx?|\.spec\.[jt]sx?|\.e2e\.[jt]sx?)$|(^|\/)(__tests__|__mocks__|__fixtures__|e2e)\//i
