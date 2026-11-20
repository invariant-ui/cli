import { run } from "../cli.js"
import { type Context, print } from "../commands.js"
import { reviewState } from "../review-data.js"
import { type DecideInput, type Outcome, type ReviewApi, startReviewServer } from "./review-server.js"

/**
 * Runs the review page: the person reads each open item with its evidence and decides it, and every decision is recorded
 * by running `invariant review <action>` itself, so the page and the terminal cannot disagree about what is allowed.
 * "Apply" runs `invariant compile`, which is what makes recorded decisions take effect.
 */
export function reviewApi(c: Context): ReviewApi {
  const carry = [
    ...(c.args.values.config ? ["--config", c.args.values.config] : []),
    ...(c.args.values.dir ? ["--dir", c.args.values.dir] : []),
    ...(c.args.values["trust-config"] ? ["--trust-config"] : [])
  ]
  const sub = async (...argv: string[]): Promise<{ code: number; out: string; err: string }> => {
    let out = ""
    let err = ""
    const code = await run([...argv, ...carry], {
      ...c.io,
      cwd: c.cwd,
      stdout: (t) => {
        out += t
      },
      stderr: (t) => {
        err += t
      }
    })
    return { code, out, err }
  }
  const first = (t: string): string =>
    t
      .trim()
      .split("\n")
      .find((l) => l.trim() !== "") ?? ""

  return {
    state: () => reviewState({ ...c, args: { ...c.args } }),
    async decide(d: DecideInput): Promise<Outcome> {
      const argv = [
        "review",
        d.action,
        d.id,
        "--as",
        d.by,
        ...(d.note ? ["--note", d.note] : []),
        ...(d.source ? ["--source", d.source] : []),
        ...(d.role ? ["--role", d.role] : []),
        ...(d.reference ? ["--reference", d.reference] : [])
      ]
      const r = await sub(...argv)
      return r.code === 0
        ? { ok: true }
        : { ok: false, message: first(r.err) || first(r.out) || "not recorded" }
    },
    async apply(): Promise<Outcome> {
      const r = await sub("compile")
      if (r.code === 0) return { ok: true, message: "Applied. The contract was compiled again." }
      if (r.code === 1)
        return {
          ok: true,
          message: "Applied, but compile reported errors. See invariant/invariant.diagnostics.json."
        }
      return { ok: false, message: first(r.err) || first(r.out) || "compile failed" }
    }
  }
}

export async function runReviewPage(c: Context): Promise<number> {
  const server = await startReviewServer(reviewApi(c))
  print(c, `The review is open in your browser: ${server.url}`)
  print(c, "Only this computer can open that link. Press Ctrl+C here to stop.")
  if (c.io.openUrl) c.io.openUrl(server.url)
  const onAbort = (): void => void server.close()
  c.io.signal?.addEventListener("abort", onAbort, { once: true })
  await server.closed
  c.io.signal?.removeEventListener("abort", onAbort)
  await server.close()
  print(c, "Review closed. Decisions that were recorded but not applied take effect at the next `compile`.")
  return 0
}
