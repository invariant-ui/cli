#!/usr/bin/env node
import { createInterface } from "node:readline/promises"
import { run } from "./cli.js"
import { setColor, setLinks } from "./format.js"
import { setLive } from "./frame.js"
import { arrowMultiSelect, arrowSelect, arrowTree } from "./select.js"
import { openBrowser } from "./web/open.js"

// Color only for a person at a terminal: pipes, CI and NO_COLOR get plain text (https://no-color.org).
const interactive = Boolean(process.stdout.isTTY) && process.env.TERM !== "dumb"
setColor(interactive && !process.env.NO_COLOR)
setLinks(interactive)
setLive(interactive)

const stop = new AbortController()
for (const sig of ["SIGINT", "SIGTERM"] as const) process.once(sig, () => stop.abort())

const code = await run(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  clock: () => new Date().toISOString(),
  env: process.env,
  input: process.stdin,
  output: process.stdout,
  signal: stop.signal,
  openUrl: openBrowser,
  ...(process.stdin.isTTY && process.stdout.isTTY
    ? {
        prompt: async (question: string) => {
          const rl = createInterface({ input: process.stdin, output: process.stdout })
          try {
            return await rl.question(question)
          } finally {
            rl.close()
          }
        },
        select: <T extends string>(question: string, choices: Parameters<typeof arrowSelect<T>>[3]) =>
          arrowSelect(process.stdin, process.stdout, question, choices),
        multiselect: <T extends string>(
          question: string,
          options: Parameters<typeof arrowMultiSelect<T>>[3]
        ) => arrowMultiSelect(process.stdin, process.stdout, question, options),
        tree: <T extends string>(question: string, groups: Parameters<typeof arrowTree<T>>[3]) =>
          arrowTree(process.stdin, process.stdout, question, groups)
      }
    : {})
})
process.exitCode = code
