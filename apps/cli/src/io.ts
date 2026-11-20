import type { Readable, Writable } from "node:stream"
import type { BrowserDriver, BrowserName } from "@invariant/browser-verify"
import type { Choice, Option, TreeGroup } from "./select.js"

export interface Io {
  cwd: string
  stdout(text: string): void
  stderr(text: string): void
  /** ISO timestamp provider; injected so artifacts can be reproduced in tests. */
  clock: () => string
  /** Environment variables (for `INVARIANT_USER`). */
  env?: Record<string, string | undefined>
  /** Streams for `mcp`, which speaks JSON-RPC over them. Absent in contexts that cannot serve. */
  input?: Readable
  output?: Writable
  /** Stops long-running commands (`compile --watch`). Absent means they run until the process ends. */
  signal?: AbortSignal
  /** Builds the browser for `browser run`. Absent means Playwright, loaded from the project. Tests inject a fake. */
  /** Asks the person a question and returns what they typed. Absent when there is no one to ask (CI, pipes). */
  prompt?: (question: string) => Promise<string | undefined>
  /** An arrow-key menu; resolves the picked value, or undefined when cancelled. Absent without a terminal. */
  select?: <T extends string>(question: string, choices: ReadonlyArray<Choice<T>>) => Promise<T | undefined>
  /** An arrow-key checklist (every option starts ticked); resolves the ticked values, or undefined when cancelled. */
  multiselect?: <T extends string>(
    question: string,
    options: ReadonlyArray<Option<T>>
  ) => Promise<T[] | undefined>
  /**
   * A scrollable arrow-key checklist of groups of items, for lists that do not fit on a screen; resolves the ticked values,
   * or undefined when cancelled. Absent without a terminal.
   */
  tree?: <T extends string>(question: string, groups: ReadonlyArray<TreeGroup<T>>) => Promise<T[] | undefined>
  /** A structured copy of what setup prints, for the browser version of setup. Absent in the terminal. */
  report?: (
    event:
      | { kind: "step" | "say" | "flag"; text: string }
      | { kind: "busy"; text: string | null }
      | { kind: "next"; title: string; lines: string[] }
      | { kind: "summary"; rows: Array<{ label: string; text: string }> }
  ) => void
  /** Tells the browser version of setup which step it is on. */
  phase?: (id: string, title: string) => void
  /** Opens a link in the person's browser. Absent when nothing can be opened (the link is printed instead). */
  openUrl?: (url: string) => void
  browserDriver?: (browser: BrowserName, projectRoot: string) => Promise<BrowserDriver>
}
