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
/** Splits input into keys: the arrow sequences are one key each, anything else is one character. */
const keysOf = (data: string): string[] => {
  const keys: string[] = []
  for (let i = 0; i < data.length; ) {
    const arrow = data.startsWith(`${ESC}[A`, i) || data.startsWith(`${ESC}[B`, i)
    const width = arrow ? 3 : 1
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
    const height = choices.length + 2 // question, one row per choice, hint
    const render = (): string =>
      [
        `${paint("accent", "◆")}  ${question}`,
        ...choices.map(
          (c, i) =>
            `${paint("muted", "│")}  ${i === at ? paint("accent", "●") : paint("muted", "○")} ${i === at ? c.label : paint("muted", c.label)}`
        ),
        `${paint("muted", "│")}  ${paint("muted", "↑/↓ move · enter choose · esc stop")}`
      ].join("\n")
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

/**
 * An arrow-key checklist in the same frame: up and down move, space toggles, `a` toggles all, Enter confirms the
 * ticked ones (every option starts ticked), and Esc or Ctrl+C cancels (resolves undefined).
 */
export function arrowMultiSelect<T extends string>(
  input: ReadStream,
  output: WriteStream,
  question: string,
  options: ReadonlyArray<Option<T>>
): Promise<T[] | undefined> {
  return new Promise((resolve) => {
    let at = 0
    const ticked = new Set(options.flatMap((o, i) => (o.ticked === false ? [] : [i])))
    const height = options.length + 2
    const render = (): string =>
      [
        `${paint("accent", "◆")}  ${question}`,
        ...options.map((o, i) => {
          const box = ticked.has(i) ? paint("ok", "◼") : paint("muted", "◻")
          const label =
            i === at ? paint("accent", o.label) : ticked.has(i) ? o.label : paint("muted", o.label)
          return `${paint("muted", "│")}  ${box} ${label}`
        }),
        `${paint("muted", "│")}  ${paint("muted", "↑/↓ move · space toggle · a all · enter confirm · esc stop")}`
      ].join("\n")
    const draw = (redraw: boolean): void => {
      if (redraw) output.write(`\r\x1b[${height}A\x1b[J`)
      output.write(`${render()}\n`)
    }
    const finish = (value: T[] | undefined): void => {
      input.off("data", onData)
      input.setRawMode(false)
      input.pause()
      output.write(`\r\x1b[${height}A\x1b[J`)
      const shown = value ? `${value.length} of ${options.length} chosen` : "stopped"
      output.write(
        `${paint("accent", "◆")}  ${question}  ${value ? paint("ok", shown) : paint("muted", shown)}\n`
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
        if (key === "\r" || key === "\n") {
          finish(options.filter((_, i) => ticked.has(i)).map((o) => o.value))
          return
        }
        if (key === `${ESC}[A`) at = (at - 1 + options.length) % options.length
        else if (key === `${ESC}[B`) at = (at + 1) % options.length
        else if (key === " ") {
          if (!ticked.delete(at)) ticked.add(at)
        } else if (key === "a") {
          if (ticked.size === options.length) ticked.clear()
          else for (let i = 0; i < options.length; i++) ticked.add(i)
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
