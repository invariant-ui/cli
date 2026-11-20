import { request } from "node:http"
import { Script } from "node:vm"
import { afterEach, describe, expect, it } from "vitest"
import type { ReviewState } from "../review-data.js"
import { REVIEW_PAGE_HTML } from "./review-page.js"
import { type DecideInput, type ReviewApi, type ReviewServer, startReviewServer } from "./review-server.js"

const STATE: ReviewState = {
  project: "demo",
  contract: { name: "@acme/ui", components: 2, tokens: 0, patterns: 0, guidelines: 0 },
  decisionsFile: "invariant.decisions.json",
  rows: [
    {
      id: "rv_1",
      kind: "conflict",
      subject: "component:button",
      path: "props.variant.default",
      priority: "medium",
      reason: "value-mismatch",
      evidence: ["src/Button.tsx:3"],
      claims: [{ sourceId: "code", status: "discovered", value: '"primary"' }]
    }
  ]
}

const open: ReviewServer[] = []
const decided: DecideInput[] = []
const api: ReviewApi = {
  state: async () => STATE,
  decide: async (d) => {
    decided.push(d)
    return d.id === "rv_1" ? { ok: true } : { ok: false, message: 'no open review item "x"' }
  },
  apply: async () => ({ ok: true, message: "Applied." })
}
const start = async (): Promise<ReviewServer> => {
  const s = await startReviewServer(api)
  open.push(s)
  return s
}
afterEach(async () => {
  decided.length = 0
  for (const s of open.splice(0)) await s.close()
})
const at = (s: ReviewServer) => {
  const u = new URL(s.url)
  return { origin: u.origin, token: u.searchParams.get("t") as string, host: u.host }
}
const post = (s: ReviewServer, path: string, body: unknown) => {
  const { origin, token } = at(s)
  return fetch(`${origin}${path}?t=${token}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body)
  })
}
const raw = (s: ReviewServer, path: string, headers: Record<string, string>, method = "GET") =>
  new Promise<number>((resolve, reject) => {
    const [h, p] = at(s).host.split(":")
    const req = request({ host: h, port: Number(p), path, method, headers }, (res) => {
      res.resume()
      res.on("end", () => resolve(res.statusCode ?? 0))
    })
    req.on("error", reject)
    req.end(method === "POST" ? "{}" : undefined)
  })

describe("the review page server", () => {
  it("serves the page and the state only with the token, on the loopback address", async () => {
    const s = await start()
    const { origin, token } = at(s)
    expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    const page = await fetch(`${origin}/?t=${token}`)
    expect(page.status).toBe(200)
    expect(page.headers.get("content-security-policy")).toMatch(/default-src 'none'/)
    expect((await fetch(`${origin}/`)).status).toBe(403)
    expect((await fetch(`${origin}/api/state`)).status).toBe(403)
    const state = (await (await fetch(`${origin}/api/state?t=${token}`)).json()) as ReviewState
    expect(state.rows[0]?.id).toBe("rv_1")
  })

  it("refuses another host or another origin, for reading and for deciding", async () => {
    const s = await start()
    const { token, host } = at(s)
    expect(await raw(s, `/api/state?t=${token}`, { host: "evil.example:80" })).toBe(403)
    expect(await raw(s, `/api/decide?t=${token}`, { host, origin: "https://evil.example" }, "POST")).toBe(403)
    expect(await raw(s, `/api/apply?t=${token}`, { host, origin: "https://evil.example" }, "POST")).toBe(403)
    expect(decided).toHaveLength(0)
  })

  it("checks what a decision looks like before the command behind it sees it", async () => {
    const s = await start()
    expect((await post(s, "/api/decide", { id: "rv_1", action: "delete", by: "ana" })).status).toBe(400)
    expect((await post(s, "/api/decide", { action: "approve", by: "ana" })).status).toBe(400)
    expect((await post(s, "/api/decide", { id: 5, action: "approve", by: "ana" })).status).toBe(400)
    const noName = (await (await post(s, "/api/decide", { id: "rv_1", action: "dismiss" })).json()) as {
      ok: boolean
      message: string
    }
    expect(noName.ok).toBe(false)
    expect(noName.message).toMatch(/who is deciding/)
    expect(decided).toHaveLength(0)
  })

  it("passes a good decision on, trimmed, and reports what the command said", async () => {
    const s = await start()
    const ok = (await (
      await post(s, "/api/decide", {
        id: "rv_1",
        action: "resolve",
        by: " ana ",
        source: "code",
        note: "  code is right ",
        junk: "ignored"
      })
    ).json()) as { ok: boolean }
    expect(ok.ok).toBe(true)
    expect(decided).toEqual([
      { id: "rv_1", action: "resolve", by: "ana", source: "code", note: "code is right" }
    ])
    const bad = (await (await post(s, "/api/decide", { id: "x", action: "accept", by: "ana" })).json()) as {
      ok: boolean
      message: string
    }
    expect(bad).toEqual({ ok: false, message: 'no open review item "x"' })
  })

  it("applies on request, and Done settles `closed`", async () => {
    const s = await start()
    expect(await (await post(s, "/api/apply", {})).json()).toEqual({ ok: true, message: "Applied." })
    let settled = false
    void s.closed.then(() => {
      settled = true
    })
    expect(settled).toBe(false)
    expect((await post(s, "/api/close", {})).status).toBe(204)
    await s.closed
    expect(settled).toBe(true)
  })
})

describe("the review page", () => {
  it("is a script that parses, with no external request and only text from the contract put in with textContent", () => {
    const script = /<script>([\s\S]*)<\/script>/.exec(REVIEW_PAGE_HTML)?.[1] ?? ""
    expect(() => new Script(script)).not.toThrow()
    expect(REVIEW_PAGE_HTML).not.toMatch(/https?:\/\/(?!www\.w3\.org)/)
    expect(REVIEW_PAGE_HTML).not.toMatch(/innerHTML|insertAdjacentHTML|document\.write|eval\(/)
    expect(REVIEW_PAGE_HTML).not.toMatch(/gradient|box-shadow|border-radius:\d{2,}px/)
    for (const token of ["#0e0e0d", "#151514", "#2a2a27", "#ece9e2"])
      expect(REVIEW_PAGE_HTML).toContain(token)
    expect(REVIEW_PAGE_HTML).toContain('localStorage.getItem("theme")')
  })
})
