import { describe, expect, it } from "vitest"
import { done, intro, line, outro, setLive, spin, wrap } from "./frame.js"

describe("frame", () => {
  it("draws the clack frame in order", () => {
    expect(intro("invariant setup")).toBe("┌  invariant setup")
    expect(line("detail")).toBe("│  detail")
    expect(done("compiled")).toBe("◇  compiled")
    expect(outro("done in 1s", true)).toBe("└  done in 1s")
  })

  it("spins only when live, and clears its line after", async () => {
    const out: string[] = []
    const write = (t: string): void => {
      out.push(t)
    }
    expect(await spin(write, "compiling", async () => 7)).toBe(7)
    expect(out).toEqual([])
    setLive(true)
    try {
      expect(await spin(write, "compiling", async () => 8)).toBe(8)
      expect(out[0]).toContain("compiling")
      expect(out.at(-1)).toBe("\r\x1b[2K")
    } finally {
      setLive(false)
    }
  })
})

describe("wrap", () => {
  it("breaks at spaces and keeps rows within the width", () => {
    expect(wrap("one two three four", 9)).toEqual(["one two", "three", "four"])
    expect(wrap("short", 40)).toEqual(["short"])
    expect(wrap("", 10)).toEqual([""])
    expect(wrap("  indented row", 40)).toEqual(["  indented row"])
  })
})
