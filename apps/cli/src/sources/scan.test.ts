import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { gitignoreRules, scan } from "./scan.js"

const made: string[] = []
afterAll(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true })
})
function project(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "invariant-scan-"))
  made.push(dir)
  for (const [file, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    writeFileSync(path.join(dir, file), body)
  }
  return dir
}

const hits = (rules: ReturnType<typeof gitignoreRules>, p: string, isDir = false): boolean =>
  rules.some((r) => (isDir || !r.dirOnly) && r.re.test(p))

describe("gitignoreRules", () => {
  it("anchors a pattern with a leading or inner slash to the project root, and lets a bare name match at any depth", () => {
    const rules = gitignoreRules("/build\nout-dir\npackages/*/gen\n# comment\n!keep\n\n")
    expect(hits(rules, "build", true)).toBe(true)
    expect(hits(rules, "src/build", true)).toBe(false)
    expect(hits(rules, "out-dir", true)).toBe(true)
    expect(hits(rules, "apps/web/out-dir", true)).toBe(true)
    expect(hits(rules, "packages/ui/gen", true)).toBe(true)
    expect(hits(rules, "other/packages/ui/gen", true)).toBe(false)
    expect(hits(rules, "keep", true)).toBe(false)
  })

  it("keeps a trailing-slash pattern for folders only, and matches file globs", () => {
    const rules = gitignoreRules("cache/\n*.log\n")
    expect(hits(rules, "cache", true)).toBe(true)
    expect(hits(rules, "cache", false)).toBe(false)
    expect(hits(rules, "logs/app.log")).toBe(true)
    expect(hits(rules, "src/app.ts")).toBe(false)
  })
})

describe("scan", () => {
  it("reads every file, with no limit on how many", async () => {
    // Above the 20,000-file limit setup used to stop at, and with the component folder sorting last.
    const files: Record<string, string> = {}
    for (let i = 0; i < 20_500; i++) files[`docs/d${i % 100}/f${i}.md`] = ""
    files["zzz/ui/Button.tsx"] = "export const Button = () => <button />"
    const dir = project(files)
    const s = await scan(dir)
    expect(s.files).toHaveLength(20_501)
    expect(s.files).toContain("zzz/ui/Button.tsx")
    // the root, docs, its 100 folders, zzz and zzz/ui
    expect(s.directories).toBe(104)
  }, 60_000)

  it("skips dependencies, build output and what .gitignore names, but not a same-named folder deeper down", async () => {
    const dir = project({
      ".gitignore": "/generated\nsecrets/\n*.generated.ts\n",
      "generated/out.ts": "",
      "src/generated/Thing.tsx": "export const Thing = () => <i />",
      "src/secrets/keep.ts": "",
      "secrets/key.ts": "",
      "src/a.generated.ts": "",
      "src/a.ts": "",
      "node_modules/x/index.js": "",
      "dist/bundle.js": ""
    })
    const s = await scan(dir)
    expect(s.files).toEqual([".gitignore", "src/a.ts", "src/generated/Thing.tsx"])
  })

  it("reports the folders it read and progress while it reads", async () => {
    const dir = project({ "a/b/c.ts": "", "a/d.ts": "", "e.ts": "" })
    const seen: number[] = []
    const s = await scan(dir, ".", (p) => seen.push(p.directories))
    expect(s.files).toEqual(["a/b/c.ts", "a/d.ts", "e.ts"])
    expect(s.directories).toBe(3)
    expect(seen).toEqual([1, 2, 3])
  })
})
