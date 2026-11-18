import { PassThrough } from "node:stream"
import { describe, expect, it } from "vitest"
import { arrowMultiSelect, arrowSelect, type Choice } from "./select.js"

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
