import { paint } from "./format.js"

// The clack-style frame (the look of @clack/prompts), drawn here so the CLI needs no dependency.
// intro opens the frame, every line sits behind the gray bar, outro closes it. Glyphs are UTF-8, colors follow format.ts.

/** Opens a frame: `┌  title`. */
export const intro = (title: string): string => `${paint("muted", "┌")}  ${paint("bold", title)}`

/** An empty bar line, used between sections. */
export const gap = (): string => paint("muted", "│")

/** A plain line inside the frame: `│  text`. */
export const line = (text: string): string => `${paint("muted", "│")}  ${text}`

/** A line that completed: `◇  text`, green. */
export const done = (text: string): string => `${paint("ok", "◇")}  ${paint("ok", text)}`

/** A warning inside the frame: `▲  text`, amber. */
export const warn = (text: string): string => `${paint("warn", "▲")}  ${paint("warn", text)}`

/** An error inside the frame: `■  text`, red. */
export const fail = (text: string): string => `${paint("bad", "■")}  ${text}`

/** Closes the frame: `└  text`, green when it passed, red when it did not. */
export const outro = (text: string, ok: boolean): string =>
  `${paint(ok ? "ok" : "bad", "└")}  ${paint(ok ? "ok" : "bad", text)}`

// Spinners animate only for a person at a terminal. CI and pipes get the static frame.
let live = false
export const setLive = (on: boolean): void => {
  live = on
}
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

/** Runs `work` with a spinner on its own line while it runs, then clears the line. Static when not live. */
export async function spin<T>(
  write: (text: string) => void,
  label: string,
  work: () => Promise<T>
): Promise<T> {
  if (!live) return work()
  let frame = 0
  const draw = (): void =>
    write(`\r${line(`${paint("accent", FRAMES[frame++ % FRAMES.length] ?? "")} ${label}`)}`)
  draw()
  const timer = setInterval(draw, 80)
  try {
    return await work()
  } finally {
    clearInterval(timer)
    write("\r\x1b[2K")
  }
}

/** Terminal width, or 100 when there is none (a pipe or CI log). */
export const columns = (): number => process.stdout.columns || 100

/** Breaks text at spaces to fit `width`. Continuation rows start at the text column, so the frame bar stays put. */
export function wrap(text: string, width: number): string[] {
  const indent = text.match(/^ */)?.[0] ?? ""
  const rows: string[] = []
  let row = indent
  for (const word of text.slice(indent.length).split(" ")) {
    const next = row === indent ? `${row}${word}` : `${row} ${word}`
    if (next.length > width && row !== indent && row !== "") {
      rows.push(row)
      row = word
    } else row = next
  }
  rows.push(row)
  return rows
}
