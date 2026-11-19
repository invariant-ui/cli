import type { ReadStream, WriteStream } from "node:tty"
import { paint } from "./format.js"

export interface Choice<T extends string> {
  value: T
  label: string
  /** The key that picks this choice at once, like `y`. */
  key: string
}

const ESC = "\x1b"
const CTRL_C = "\x03"
/**
 * Splits input into keys: a control sequence (arrows, Home, End, Page Up and Down) is one key, anything else is one
 * character. A lone Esc is the Esc key. Keys nobody listens for are ignored, so a stray arrow never cancels a menu.
 */
const keysOf = (data: string): string[] => {
  const keys: string[] = []
  for (let i = 0; i < data.length; ) {
    let width = 1
    if (data[i] === ESC && data[i + 1] === "[") {
      let j = i + 2
      while (j < data.length && !/[@-~]/.test(data[j] as string)) j++
      width = Math.min(j + 1, data.length) - i
    } else if (data[i] === ESC && data[i + 1] === "O") width = Math.min(3, data.length - i)
    keys.push(data.slice(i, i + width))
    i += width
  }
  return keys
}

/**
 * An arrow-key menu inside the clack frame: up and down move, Enter picks, a choice's own key picks it, and Esc or
 * Ctrl+C cancels (resolves undefined). Only for a terminal; the caller checks isTTY.
 */
export function arrowSelect<T extends string>(
  input: ReadStream,
  output: WriteStream,
  question: string,
  choices: ReadonlyArray<Choice<T>>
): Promise<T | undefined> {
  return new Promise((resolve) => {
    let at = 0
    let top = 0
    // A long list scrolls inside a window instead of running off the screen, where it could not be redrawn.
    const window = Math.min(choices.length, Math.max(5, ((output as { rows?: number }).rows || 24) - 5))
    const wide = ((output as { columns?: number }).columns || 100) - 8
    const height = window + 2 // question, the window, hint
    const render = (): string => {
      if (at < top) top = at
      else if (at >= top + window) top = at - window + 1
      return [
        `${paint("accent", "◆")}  ${question}`,
        ...choices.slice(top, top + window).map((c, k) => {
          const text = c.label.length > wide ? `${c.label.slice(0, wide - 1)}…` : c.label
          return `${paint("muted", "│")}  ${top + k === at ? paint("accent", "●") : paint("muted", "○")} ${top + k === at ? text : paint("muted", text)}`
        }),
        `${paint("muted", "│")}  ${paint("muted", `↑/↓ move · enter choose · esc stop${choices.length > window ? ` · ${at + 1} of ${choices.length}` : ""}`)}`
      ].join("\n")
    }
    const draw = (redraw: boolean): void => {
      if (redraw) output.write(`\r\x1b[${height}A\x1b[J`)
      output.write(`${render()}\n`)
    }
    const finish = (value: T | undefined): void => {
      input.off("data", onData)
      input.setRawMode(false)
      input.pause()
      const picked = choices.find((c) => c.value === value)
      output.write(`\r\x1b[${height}A\x1b[J`)
      output.write(
        `${paint("accent", "◆")}  ${question}  ${picked ? paint("ok", picked.label) : paint("muted", "stopped")}\n`
      )
      output.write("\x1b[?25h")
      resolve(value)
    }
    const onData = (data: Buffer | string): void => {
      for (const key of keysOf(String(data))) {
        if (key === CTRL_C || key === ESC) {
          finish(undefined)
          return
        }
        if (key === `${ESC}[A`) at = (at - 1 + choices.length) % choices.length
        else if (key === `${ESC}[B`) at = (at + 1) % choices.length
        else if (key === "\r" || key === "\n") {
          finish(choices[at]?.value)
          return
        } else {
          const hit = choices.find((c) => c.key === key)
          if (hit) {
            finish(hit.value)
            return
          }
        }
      }
      draw(true)
    }
    input.setRawMode(true)
    input.resume()
    input.on("data", onData)
    output.write("\x1b[?25l")
    draw(false)
  })
}

export interface Option<T extends string> {
  value: T
  label: string
  /** Starts ticked unless false. */
  ticked?: boolean
}

export interface TreeItem<T extends string> {
  value: T
  label: string
  ticked?: boolean
}

export interface TreeGroup<T extends string> {
  /** The group's own row. Toggling it toggles every item in the group. */
  label: string
  /** No row of its own: the items are listed as a plain checklist. */
  bare?: boolean
  collapsed?: boolean
  items: ReadonlyArray<TreeItem<T>>
}

const UP = `${ESC}[A`
const DOWN = `${ESC}[B`
const RIGHT = `${ESC}[C`
const LEFT = `${ESC}[D`
const PAGE_UP = `${ESC}[5~`
const PAGE_DOWN = `${ESC}[6~`
const HOMES = [`${ESC}[H`, `${ESC}[1~`, `${ESC}OH`]
const ENDS = [`${ESC}[F`, `${ESC}[4~`, `${ESC}OF`]

const fit = (text: string, width: number): string =>
  text.length > width ? `${text.slice(0, Math.max(1, width - 1))}…` : text

/**
 * An arrow-key checklist of groups of items, for lists that do not fit on a screen: it shows a window of rows and scrolls.
 * Up and down move (Page Up, Page Down, Home and End jump), space toggles an item or, on a group row, the whole group,
 * `a` ticks everything (or clears it when everything is ticked), `n` clears, right and left unfold and fold a group,
 * `e` and `c` unfold and fold all, Enter confirms the ticked items, and Esc or Ctrl+C cancels (resolves undefined).
 */
export function arrowTree<T extends string>(
  input: ReadStream,
  output: WriteStream,
  question: string,
  groups: ReadonlyArray<TreeGroup<T>>
): Promise<T[] | undefined> {
  return new Promise((resolve) => {
    const items = groups.flatMap((g, gi) => g.items.map((it) => ({ ...it, gi })))
    const ticked = items.map((it) => it.ticked !== false)
    const folded = groups.map((g) => g.collapsed === true && g.bare !== true)
    const members = groups.map((_, gi) => items.flatMap((it, i) => (it.gi === gi ? [i] : [])))
    type Row = { kind: "group"; gi: number } | { kind: "item"; i: number }
    const rows = (): Row[] =>
      groups.flatMap((g, gi): Row[] => [
        ...(g.bare ? [] : [{ kind: "group" as const, gi }]),
        ...(folded[gi] ? [] : (members[gi] ?? []).map((i) => ({ kind: "item" as const, i })))
      ])
    const fullHeight = groups.filter((g) => !g.bare).length + items.length
    const screen = (output as { rows?: number }).rows || 24
    const width = ((output as { columns?: number }).columns || 100) - 12
    const window = Math.min(Math.max(5, screen - 5), Math.max(1, fullHeight))
    const height = window + 2 // the question, the window, the hint
    let cursor = 0
    let top = 0
    const tickedOf = (gi: number): number => (members[gi] ?? []).filter((i) => ticked[i]).length
    const count = (): number => ticked.filter(Boolean).length
    const render = (): string => {
      const list = rows()
      cursor = Math.min(cursor, Math.max(0, list.length - 1))
      if (cursor < top) top = cursor
      else if (cursor >= top + window) top = cursor - window + 1
      top = Math.max(0, Math.min(top, Math.max(0, list.length - window)))
      const lines = list.slice(top, top + window).map((row, at) => {
        const here = top + at === cursor
        if (row.kind === "group") {
          const n = (members[row.gi] ?? []).length
          const t = tickedOf(row.gi)
          const box = t === n ? paint("ok", "◼") : t === 0 ? paint("muted", "◻") : paint("accent", "◪")
          const text = fit(groups[row.gi]?.label ?? "", width - 4)
          return `${paint("muted", "│")}  ${folded[row.gi] ? "▸" : "▾"} ${box} ${here ? paint("accent", text) : paint("bold", text)}`
        }
        const it = items[row.i]
        const bare = groups[it?.gi ?? 0]?.bare === true
        const box = ticked[row.i] ? paint("ok", "◼") : paint("muted", "◻")
        const text = fit(it?.label ?? "", width - (bare ? 2 : 6))
        const label = here ? paint("accent", text) : ticked[row.i] ? text : paint("muted", text)
        return `${paint("muted", "│")}  ${bare ? "" : "    "}${box} ${label}`
      })
      while (lines.length < window) lines.push(paint("muted", "│"))
      const place =
        list.length > window
          ? ` · rows ${top + 1}-${Math.min(list.length, top + window)} of ${list.length}`
          : ""
      return [
        `${paint("accent", "◆")}  ${question}  ${paint("muted", `(${count()} of ${items.length} ticked)`)}`,
        ...lines,
        `${paint("muted", "│")}  ${paint("muted", `↑/↓ move · space toggle · a all/none · ←/→ fold · enter confirm · esc stop${place}`)}`
      ].join("\n")
    }
    const draw = (redraw: boolean): void => {
      if (redraw) output.write(`\r\x1b[${height}A\x1b[J`)
      output.write(`${render()}\n`)
    }
    const finish = (value: T[] | undefined): void => {
      input.off("data", onData)
      input.setRawMode(false)
      input.pause()
      output.write(`\r\x1b[${height}A\x1b[J`)
      const shown = value ? `${value.length} of ${items.length} chosen` : "stopped"
      output.write(
        `${paint("accent", "◆")}  ${question}  ${value ? paint("ok", shown) : paint("muted", shown)}\n`
      )
      output.write("\x1b[?25h")
      resolve(value)
    }
    const setAll = (on: boolean): void => {
      for (let i = 0; i < ticked.length; i++) ticked[i] = on
    }
    const onData = (data: Buffer | string): void => {
      for (const key of keysOf(String(data))) {
        const list = rows()
        const row = list[cursor]
        if (key === CTRL_C || key === ESC) {
          finish(undefined)
          return
        }
        if (key === "\r" || key === "\n") {
          finish(items.filter((_, i) => ticked[i]).map((it) => it.value))
          return
        }
        if (key === UP) cursor = (cursor - 1 + list.length) % Math.max(1, list.length)
        else if (key === DOWN) cursor = (cursor + 1) % Math.max(1, list.length)
        else if (key === PAGE_UP) cursor = Math.max(0, cursor - (window - 1))
        else if (key === PAGE_DOWN) cursor = Math.min(list.length - 1, cursor + (window - 1))
        else if (HOMES.includes(key)) cursor = 0
        else if (ENDS.includes(key)) cursor = Math.max(0, list.length - 1)
        else if (key === RIGHT && row?.kind === "group") folded[row.gi] = false
        else if (key === LEFT && row) {
          const gi = row.kind === "group" ? row.gi : (items[row.i]?.gi ?? 0)
          if (groups[gi]?.bare !== true) {
            folded[gi] = true
            cursor = Math.max(
              0,
              rows().findIndex((r) => r.kind === "group" && r.gi === gi)
            )
          }
        } else if (key === " " && row) {
          if (row.kind === "item") ticked[row.i] = !ticked[row.i]
          else {
            const on = tickedOf(row.gi) !== (members[row.gi] ?? []).length
            for (const i of members[row.gi] ?? []) ticked[i] = on
          }
        } else if (key === "a") setAll(count() !== items.length)
        else if (key === "n") setAll(false)
        else if (key === "e") folded.fill(false)
        else if (key === "c") {
          for (const [gi, g] of groups.entries()) folded[gi] = g.bare !== true
        }
      }
      draw(true)
    }
    input.setRawMode(true)
    input.resume()
    input.on("data", onData)
    output.write("\x1b[?25l")
    draw(false)
  })
}

/** A plain arrow-key checklist: one group with no row of its own. Scrolls when the options do not fit. */
export function arrowMultiSelect<T extends string>(
  input: ReadStream,
  output: WriteStream,
  question: string,
  options: ReadonlyArray<Option<T>>
): Promise<T[] | undefined> {
  return arrowTree(input, output, question, [
    {
      label: "",
      bare: true,
      items: options.map((o) => ({ value: o.value, label: o.label, ticked: o.ticked !== false }))
    }
  ])
}
