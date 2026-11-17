import { pathToFileURL } from "node:url"
import type { Diagnostic } from "@invariant/shared"

// shortcut: one process-wide switch, set once by main.ts; move onto Io if a second renderer needs its own setting.
let colorOn = false
export const setColor = (on: boolean): void => {
  colorOn = on
}
/** Colors follow the site palette (site/design.md): ok green, warn amber, bad red, muted gray. */
const CODES = {
  bad: "38;2;248;113;113",
  warn: "38;2;251;191;36",
  ok: "38;2;74;222;128",
  muted: "38;2;154;150;140",
  accent: "38;2;124;140;255"
}
export const paint = (tone: keyof typeof CODES | "bold", text: string): string =>
  !colorOn || text === "" ? text : `\x1b[${tone === "bold" ? "1" : CODES[tone]}m${text}\x1b[0m`

// Hyperlinks (OSC 8) are set once by main.ts, on for a person at a terminal only: pipes and CI get the text alone.
let linksOn = false
export const setLinks = (on: boolean): void => {
  linksOn = on
}
/** A clickable file link in terminals that support OSC 8; otherwise the visible text, which is the path. */
export const fileLink = (absolutePath: string, text: string): string =>
  linksOn ? `\x1b]8;;${pathToFileURL(absolutePath).href}\x1b\\${text}\x1b]8;;\x1b\\` : text
const SEVERITY_TONE = { error: "bad", warning: "warn", info: "accent" } as const

export function table(head: string[], rows: ReadonlyArray<ReadonlyArray<string | number>>): string {
  const all = [head, ...rows.map((r) => r.map(String))]
  const widths = head.map((_, i) => Math.max(...all.map((r) => (r[i] ?? "").length)))
  const line = (r: readonly string[], tone?: "muted" | "bold"): string =>
    r
      .map((c, i) => {
        const cell = c.padEnd(widths[i] ?? 0)
        return tone ? paint(tone, cell) : cell
      })
      .join("  ")
      .trimEnd()
  return [
    line(head, "bold"),
    line(
      widths.map((w) => "-".repeat(w)),
      "muted"
    ),
    ...all.slice(1).map((r) => line(r))
  ].join("\n")
}

export function formatDiagnostic(d: Diagnostic): string {
  const where = d.location ? ` (${d.location.path}${d.location.line ? `:${d.location.line}` : ""})` : ""
  const tone = SEVERITY_TONE[d.severity as keyof typeof SEVERITY_TONE]
  if (tone) return paint(tone, `${d.severity.padEnd(7)} ${d.code}: ${d.message}${where}`)
  return `${paint("muted", d.severity.padEnd(7))} ${paint("bold", d.code)}: ${d.message}${paint("muted", where)}`
}

export function countBySeverity(diagnostics: readonly Diagnostic[]): string {
  const n = (s: string): number => diagnostics.filter((d) => d.severity === s).length
  return `${paint("bad", `${n("error")} errors`)}, ${paint("warn", `${n("warning")} warnings`)}, ${paint("accent", `${n("info")} info`)}`
}

/** Severity colors for console text: error red, warning yellow, info blue (the site's accent). */
export const terminalStyle = {
  error: (text: string): string => paint("bad", text),
  warning: (text: string): string => paint("warn", text),
  info: (text: string): string => paint("accent", text),
  success: (text: string): string => paint("ok", text)
}

export function shortValue(value: unknown, max = 40): string {
  const text = value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value)
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
