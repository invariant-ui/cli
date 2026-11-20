import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { run } from "@invariant/cli"
import { FIXED_CLOCK } from "@invariant/compiler-core/testing"
import { afterAll, describe, expect, it } from "vitest"
import type { ReviewState } from "../apps/cli/src/review-data.js"

const root = fileURLToPath(new URL("..", import.meta.url))
const made: string[] = []
afterAll(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true })
})

async function cli(cwd: string, argv: string[], extra: Record<string, unknown> = {}) {
  let out = ""
  let err = ""
  const code = await run(argv, {
    cwd,
    stdout: (t: string) => (out += t),
    stderr: (t: string) => (err += t),
    clock: FIXED_CLOCK,
    env: {},
    ...extra
  } as never)
  return { code, out, err }
}

/** A compiled project that has conflicts and inferred facts waiting for a decision. */
async function project(): Promise<string> {
  const dir = mkdtempSync(path.join(tmpdir(), "invariant-review-"))
  made.push(dir)
  cpSync(path.join(root, "fixtures/storybook/acme-ui"), dir, {
    recursive: true,
    filter: (s) => !s.includes("storybook-static")
  })
  await cli(dir, ["init"])
  expect((await cli(dir, ["compile"])).code).toBe(0)
  return dir
}

/** Runs `review list --web` and gives the page's address; `finish` ends it the way the Done button does. */
async function page(dir: string) {
  let opened: (u: string) => void = () => {}
  const address = new Promise<string>((r) => {
    opened = r
  })
  const ran = cli(dir, ["review", "list", "--web"], { openUrl: opened })
  const u = new URL(await address)
  const token = u.searchParams.get("t")
  const call = (p: string, body?: unknown) =>
    fetch(`${u.origin}${p}?t=${token}`, {
      ...(body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "content-type": "application/json", origin: u.origin },
            body: JSON.stringify(body)
          })
    })
  return {
    state: async () => (await (await call("/api/state")).json()) as ReviewState,
    decide: async (body: unknown) =>
      (await (await call("/api/decide", body)).json()) as { ok: boolean; message?: string },
    apply: async () => (await (await call("/api/apply", {})).json()) as { ok: boolean; message?: string },
    finish: async () => {
      await call("/api/close", {})
      return ran
    }
  }
}

describe("invariant review list", () => {
  it("keeps the table for --terminal, --json and when nobody can answer", async () => {
    const dir = await project()
    const interactive = { select: async () => undefined, prompt: async () => undefined }
    for (const argv of [
      ["review", "list", "--terminal"],
      ["review", "list"]
    ]) {
      const r = await cli(dir, argv, argv.includes("--terminal") ? interactive : {})
      expect(r.code).toBe(0)
      expect(r.out).toMatch(/id\s+priority\s+kind\s+subject/)
    }
    const j = await cli(dir, ["review", "list", "--json"], interactive)
    expect(Array.isArray(JSON.parse(j.out))).toBe(true)
  })

  it("opens a page on a terminal, with the open items, their evidence and what each source says", async () => {
    const dir = await project()
    const open: string[] = []
    const r = cli(dir, ["review", "list"], {
      select: async () => undefined,
      prompt: async () => undefined,
      openUrl: (u: string) => open.push(u)
    })
    // The page is offered without a question; the same run is stopped by pressing Done.
    while (open.length === 0) await new Promise((x) => setTimeout(x, 20))
    const u = new URL(open[0] as string)
    const token = u.searchParams.get("t")
    const state = (await (await fetch(`${u.origin}/api/state?t=${token}`)).json()) as ReviewState
    await fetch(`${u.origin}/api/close?t=${token}`, { method: "POST", headers: { origin: u.origin } })
    expect((await r).code).toBe(0)
    const conflict = state.rows.find((x) => x.kind === "conflict")
    expect(conflict?.claims?.length).toBeGreaterThan(1)
    expect(conflict?.evidence.length).toBeGreaterThan(0)
    expect(state.contract.name).toBe("@acme/ui")
  })

  it("records a decision through the review command, applies it with a compile, and the item leaves the queue", async () => {
    const dir = await project()
    const p = await page(dir)
    const before = await p.state()
    const target = before.rows.find((x) => x.kind === "conflict") as NonNullable<ReviewState["rows"][number]>
    const source = target.claims?.[0]?.sourceId as string

    const recorded = await p.decide({
      id: target.id,
      action: "resolve",
      by: "ana",
      source,
      note: "the code is right"
    })
    expect(recorded.ok).toBe(true)
    const file = JSON.parse(readFileSync(path.join(dir, "invariant.decisions.json"), "utf8")) as {
      decisions: Array<{ action: string; by: string; chosenSourceId?: string; note?: string }>
    }
    expect(file.decisions).toHaveLength(1)
    expect(file.decisions[0]).toMatchObject({
      action: "resolve",
      by: "ana",
      chosenSourceId: source,
      note: "the code is right"
    })

    // Recorded, not applied: it still shows, marked.
    const mid = await p.state()
    expect(mid.rows.find((x) => x.id === target.id)?.decision).toMatchObject({
      action: "resolve",
      by: "ana",
      source
    })

    expect((await p.apply()).ok).toBe(true)
    const after = await p.state()
    expect(after.rows.find((x) => x.id === target.id)).toBeUndefined()
    expect(after.rows.length).toBeLessThan(before.rows.length)
    expect((await p.finish()) as { code: number }).toMatchObject({ code: 0 })
  })

  it("says why a decision cannot be recorded, as the command would", async () => {
    const dir = await project()
    const p = await page(dir)
    const state = await p.state()
    const conflict = state.rows.find((x) => x.kind === "conflict") as NonNullable<ReviewState["rows"][number]>
    const wrongKind = await p.decide({ id: conflict.id, action: "approve", by: "ana" })
    expect(wrongKind.ok).toBe(false)
    expect(wrongKind.message).toMatch(/applies to facts/)
    const unknown = await p.decide({ id: "rv_doesnotexist", action: "dismiss", by: "ana" })
    expect(unknown.ok).toBe(false)
    expect(unknown.message).toMatch(/no open review item/)
    expect(existsSync(path.join(dir, "invariant.decisions.json"))).toBe(false)
    await p.finish()
  })

  it("only accepts the names the configuration lists as approvers", async () => {
    const dir = await project()
    const configFile = path.join(dir, "invariant.config.json")
    const config = JSON.parse(readFileSync(configFile, "utf8")) as Record<string, unknown>
    writeFileSync(configFile, JSON.stringify({ ...config, governance: { approvers: ["boss"] } }))
    const p = await page(dir)
    const state = await p.state()
    expect(state.approvers).toEqual(["boss"])
    const conflict = state.rows.find((x) => x.kind === "conflict") as NonNullable<ReviewState["rows"][number]>
    const refused = await p.decide({ id: conflict.id, action: "dismiss", by: "ana" })
    expect(refused.ok).toBe(false)
    expect(refused.message).toMatch(/not listed in governance\.approvers/)
    expect((await p.decide({ id: conflict.id, action: "dismiss", by: "boss" })).ok).toBe(true)
    await p.finish()
  })
})
