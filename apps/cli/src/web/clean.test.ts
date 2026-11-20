import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { snapshot } from "./clean.js"

const roots: string[] = []
const project = (): string => {
  const d = mkdtempSync(path.join(tmpdir(), "invariant-clean-"))
  roots.push(d)
  return d
}
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

describe("snapshot", () => {
  it("removes what setup created and puts back what it changed", () => {
    const cwd = project()
    const config = path.join(cwd, "invariant.config.json")
    const out = path.join(cwd, "invariant")
    const own = path.join(cwd, "keep.txt")
    writeFileSync(own, "mine")
    mkdirSync(out)
    writeFileSync(path.join(out, "old.json"), "old")
    const snap = snapshot(cwd, { files: [config], dirs: [out] })
    writeFileSync(config, "{}")
    writeFileSync(path.join(out, "new.json"), "new")
    writeFileSync(path.join(out, "old.json"), "changed")
    const touched = snap.restore()
    snap.discard()
    expect(existsSync(config)).toBe(false)
    expect(readFileSync(path.join(out, "old.json"), "utf8")).toBe("old")
    expect(existsSync(path.join(out, "new.json"))).toBe(false)
    expect(readFileSync(own, "utf8")).toBe("mine")
    expect(touched).toEqual(["invariant.config.json", "invariant/"])
  })

  it("removes a folder that did not exist before, and leaves a file that was not changed alone", () => {
    const cwd = project()
    const config = path.join(cwd, "invariant.config.json")
    writeFileSync(config, '{"a":1}')
    const out = path.join(cwd, "invariant")
    const snap = snapshot(cwd, { files: [config], dirs: [out] })
    mkdirSync(out)
    writeFileSync(path.join(out, "x"), "x")
    expect(snap.restore()).toEqual(["invariant/"])
    snap.discard()
    expect(existsSync(out)).toBe(false)
    expect(readFileSync(config, "utf8")).toBe('{"a":1}')
  })

  it("never touches the project folder, a path outside it, or anything under node_modules", () => {
    const cwd = project()
    const outside = project()
    writeFileSync(path.join(cwd, "a.txt"), "a")
    writeFileSync(path.join(outside, "b.txt"), "b")
    mkdirSync(path.join(cwd, "node_modules"))
    writeFileSync(path.join(cwd, "node_modules", "c.txt"), "c")
    const snap = snapshot(cwd, {
      files: [path.join(outside, "b.txt")],
      dirs: [cwd, outside, path.join(cwd, "node_modules")]
    })
    expect(snap.restore()).toEqual([])
    snap.discard()
    expect(readFileSync(path.join(cwd, "a.txt"), "utf8")).toBe("a")
    expect(readFileSync(path.join(outside, "b.txt"), "utf8")).toBe("b")
    expect(readFileSync(path.join(cwd, "node_modules", "c.txt"), "utf8")).toBe("c")
  })
})
