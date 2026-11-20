import path from "node:path"
import { type Context, outputDir, print } from "../commands.js"
import { CONFIG_FILE } from "../config.js"
import { CliError } from "../errors.js"
import type { Io } from "../io.js"
import { snapshot } from "./clean.js"
import { startWebServer } from "./server.js"

/**
 * Runs setup with its questions answered in the browser. The setup code is the same as in the terminal: only the way a
 * question is asked and what is printed change. The terminal keeps printing the progress, so closing the tab never hides
 * what happened.
 */
export async function runInBrowser(c: Context, setup: (c: Context) => Promise<number>): Promise<number> {
  const session = await startWebServer()
  print(c, `Setup is open in your browser: ${session.url}`)
  print(c, "Only this computer can open that link. Press Ctrl+C here to stop.")
  if (c.io.openUrl) c.io.openUrl(session.url)
  session.emit({ type: "project", name: path.basename(c.cwd) })
  // What setup writes before the plan is confirmed: the configuration and the compiled contract folder. Start over puts
  // them back, so the next run begins from the scan, not from the leftovers of this one.
  const output = await outputDir(c).catch(() => undefined)
  const clean = snapshot(c.cwd, {
    files: [path.resolve(c.cwd, c.args.values.config ?? CONFIG_FILE)],
    dirs: output ? [output] : []
  })
  const onAbort = (): void => void session.close()
  c.io.signal?.addEventListener("abort", onAbort, { once: true })
  let finishing = false
  const io: Io = {
    ...c.io,
    prompt: (q) => session.prompt(q),
    select: (q, choices) => session.select(q, choices),
    multiselect: (q, options) => session.multiselect(q, options),
    tree: (q, groups) => session.tree(q, groups),
    phase: (id, title) => {
      finishing = id === "done"
      session.emit({ type: "phase", id, title })
    },
    report: (e) => {
      if (e.kind === "busy") session.emit({ type: "busy", text: e.text })
      else if (e.kind === "next") session.emit({ type: "next", title: e.title, lines: e.lines })
      else if (e.kind === "summary") session.emit({ type: "summary", rows: e.rows })
      else session.emit({ type: "log", kind: e.kind, text: e.text })
    }
  }
  const inner: Context = {
    ...c,
    io,
    args: { ...c.args, values: { ...c.args.values, terminal: true, web: false } }
  }
  let code = 1
  let error: string | undefined
  try {
    // "Start over" in the browser cancels the open question, so setup stops on its own; run it again from the scan.
    for (;;) {
      error = undefined
      finishing = false
      try {
        code = await setup(inner)
      } catch (e) {
        error = (e as Error).message
        code = e instanceof CliError ? e.exitCode : 1
        c.io.stderr(`${error}\n`)
      }
      // Past the last step the files are written and a restart would not undo them: let setup end.
      if (!session.restarting || finishing || c.io.signal?.aborted) break
      const undone = clean.restore()
      print(c, `Starting over.${undone.length > 0 ? ` Put back ${undone.join(", ")}.` : ""}`)
      // A project that was set up before keeps its saved decisions, and setup would go straight past them to the plan.
      // Starting over means looking at the components again, with the earlier choices ticked.
      inner.args.values.rediscover = true
      session.reset()
    }
    // Setup ended before its last step (Stop, Ctrl+C, "No, stop", or a plan that was not confirmed): it applied nothing,
    // so do not leave the configuration and the compiled contract it made along the way. A failure keeps them, since its
    // message points at the diagnostics in that folder.
    if (!finishing && !error) {
      const undone = clean.restore()
      if (undone.length > 0) {
        const text = `Stopped. Put back ${undone.join(", ")}.`
        print(c, text)
        session.emit({ type: "log", kind: "step", text })
      }
    }
  } finally {
    c.io.signal?.removeEventListener("abort", onAbort)
    clean.discard()
  }
  await session.finish(code, error)
  return code
}
