import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

export interface Snapshot {
  /** Puts every path back as it was when the snapshot was taken. Returns what was removed or put back, project-relative. */
  restore(): string[]
  /** Deletes the copies held in the temporary folder. */
  discard(): void
}

/** A path setup may write: inside the project, never the project itself, never under node_modules. */
const safe = (cwd: string, p: string): boolean => {
  const r = path.relative(cwd, p)
  return r !== "" && !r.startsWith("..") && !path.isAbsolute(r) && !r.split(path.sep).includes("node_modules")
}

/**
 * Remembers the files and folders setup writes before the person confirms its plan (the configuration and the compiled
 * contract folder), so "start over" can put the project back as it was. A path that did not exist is removed on restore;
 * one that did is put back with its old content. Anything outside the project is ignored.
 */
export function snapshot(cwd: string, input: { files: string[]; dirs: string[] }): Snapshot {
  const keep = mkdtempSync(path.join(tmpdir(), "invariant-setup-"))
  const files = input.files
    .filter((f) => safe(cwd, f))
    .map((file) => ({ file, text: existsSync(file) ? readFileSync(file, "utf8") : undefined }))
  const dirs = input.dirs
    .filter((d) => safe(cwd, d))
    .map((dir, i) => {
      const copy = path.join(keep, String(i))
      const had = existsSync(dir)
      if (had) cpSync(dir, copy, { recursive: true })
      return { dir, copy, had }
    })
  return {
    restore() {
      const touched: string[] = []
      for (const f of files) {
        if (f.text === undefined) {
          if (existsSync(f.file)) touched.push(path.relative(cwd, f.file))
          rmSync(f.file, { force: true })
        } else if (!existsSync(f.file) || readFileSync(f.file, "utf8") !== f.text) {
          writeFileSync(f.file, f.text)
          touched.push(path.relative(cwd, f.file))
        }
      }
      for (const d of dirs) {
        if (!d.had && existsSync(d.dir)) touched.push(`${path.relative(cwd, d.dir)}/`)
        if (d.had) touched.push(`${path.relative(cwd, d.dir)}/`)
        rmSync(d.dir, { recursive: true, force: true })
        if (d.had) cpSync(d.copy, d.dir, { recursive: true })
      }
      return touched
    },
    discard() {
      rmSync(keep, { recursive: true, force: true })
    }
  }
}
