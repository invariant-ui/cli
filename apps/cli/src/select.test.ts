import { PassThrough } from "node:stream"
import { describe, expect, it } from "vitest"
import { arrowMultiSelect, arrowSelect, arrowTree, type Choice } from "./select.js"

const choices: Choice<"yes" | "custom" | "no">[] = [
  { value: "yes", label: "Yes, apply this setup", key: "y" },
  { value: "custom", label: "Choose each step", key: "c" },
  { value: "no", label: "No, stop", key: "n" }
]

/** A fake terminal: a stream with setRawMode, and an output that keeps what was written. */
function terminal() {
  const input = Object.assign(new PassThrough(), { setRawMode: (_on: boolean) => {} })
  let written = ""
  const output = {
    write: (t: string) => {
      written += t
      return true
    }
  }
  return { input, output, text: () => written }
}

describe("arrowSelect", () => {
  it("moves with the arrows and picks with Enter", async () => {
    const t = terminal()
    const picked = arrowSelect(t.input as never, t.output as never, "Looks right?", choices)
    t.input.write("\x1b[B") // down: Choose each step
    t.input.write("\x1b[B") // down: No, stop
    t.input.write("\x1b[A") // up: Choose each step
    t.input.write("\r")
    expect(await picked).toBe("custom")
    expect(t.text()).toContain("Looks right?  Choose each step")
  })

  it("picks at once with a choice's own key", async () => {
    const t = terminal()
    const picked = arrowSelect(t.input as never, t.output as never, "Looks right?", choices)
    t.input.write("n")
    expect(await picked).toBe("no")
  })

  it("resolves undefined on Esc or Ctrl+C", async () => {
    const esc = terminal()
    const a = arrowSelect(esc.input as never, esc.output as never, "Looks right?", choices)
    esc.input.write("\x1b")
    expect(await a).toBeUndefined()
    const ctrl = terminal()
    const b = arrowSelect(ctrl.input as never, ctrl.output as never, "Looks right?", choices)
    ctrl.input.write("\x03")
    expect(await b).toBeUndefined()
  })
})

describe("arrowMultiSelect", () => {
  const opts = [
    { value: "a", label: "one" },
    { value: "b", label: "two" },
    { value: "c", label: "three" }
  ]
  it("starts with everything ticked and confirms with Enter", async () => {
    const t = terminal()
    const p = arrowMultiSelect(t.input as never, t.output as never, "Which?", opts)
    t.input.write("\r")
    expect(await p).toEqual(["a", "b", "c"])
  })
  it("toggles the current option with space and all with a", async () => {
    const t = terminal()
    const p = arrowMultiSelect(t.input as never, t.output as never, "Which?", opts)
    t.input.write("\x1b[B") // down to two
    t.input.write(" ") // untick two
    t.input.write("\r")
    expect(await p).toEqual(["a", "c"])
    const u = terminal()
    const q = arrowMultiSelect(u.input as never, u.output as never, "Which?", opts)
    u.input.write("a") // all ticked, so clear
    u.input.write("\x1b[B")
    u.input.write(" ")
    u.input.write("\r")
    expect(await q).toEqual(["b"])
  })
  it("resolves undefined on Esc", async () => {
    const t = terminal()
    const p = arrowMultiSelect(t.input as never, t.output as never, "Which?", opts)
    t.input.write("\x1b")
    expect(await p).toBeUndefined()
  })
})

describe("arrowTree", () => {
  const groups = [
    {
      label: "src/a",
      items: [
        { value: "a1", label: "A1" },
        { value: "a2", label: "A2" }
      ]
    },
    { label: "src/b", items: [{ value: "b1", label: "B1", ticked: false }] }
  ]
  const run = (keys: string[], g: typeof groups = groups, rows?: number) => {
    const t = terminal()
    if (rows) (t.output as { rows?: number }).rows = rows
    const p = arrowTree(t.input as never, t.output as never, "Which?", g)
    for (const k of keys) t.input.write(k)
    return { p, t }
  }

  it("lists every item with its tick, and confirms the ticked ones", async () => {
    const { p, t } = run(["\r"])
    expect(await p).toEqual(["a1", "a2"])
    expect(t.text()).toContain("(2 of 3 ticked)")
  })

  it("toggles an item with space, a group with space on its row, and everything with a", async () => {
    // down to A1, untick it
    expect(await run(["\x1b[B", " ", "\r"]).p).toEqual(["a2"])
    // on the src/a row: everything in it is ticked, so space clears it
    expect(await run([" ", "\r"]).p).toEqual([])
    // on the src/b row: it holds an unticked item, so space ticks it
    expect(await run(["\x1b[A", " ", "\r"]).p).toEqual(["a1", "a2", "b1"])
    // a ticks all when something is unticked, then clears when all are ticked
    expect(await run(["a", "\r"]).p).toEqual(["a1", "a2", "b1"])
    expect(await run(["a", "a", "\r"]).p).toEqual([])
    expect(await run(["n", "\r"]).p).toEqual([])
  })

  it("folds and unfolds a group, and a sideways arrow never cancels", async () => {
    const folded = run(["\x1b[D"])
    folded.t.input.write("\x1b[C")
    folded.t.input.write("\r")
    expect(await folded.p).toEqual(["a1", "a2"])
    expect(folded.t.text()).toContain("▸")
  })

  it("resolves undefined on Esc", async () => {
    expect(await run(["\x1b"]).p).toBeUndefined()
  })

  it("scrolls a long list inside a window instead of drawing every row", async () => {
    const long = [
      { label: "many", items: Array.from({ length: 50 }, (_, i) => ({ value: `v${i}`, label: `item-${i}` })) }
    ]
    const { p, t } = run(["\x1b[6~", "\x1b[6~"], long, 10)
    t.input.write("\r")
    expect(await p).toHaveLength(50)
    const text = t.text()
    // Only a window of rows was ever drawn: the first frame shows item-0 but not item-30.
    const firstFrame = text.slice(0, text.indexOf("\x1b[")) // before the first redraw
    expect(text).toContain("rows 1-5 of 51")
    expect(text).toContain("item-7")
    expect(text).not.toContain("item-49")
    expect(firstFrame).not.toContain("item-30")
  })
})
