import { request } from "node:http"
import { Script } from "node:vm"
import { afterEach, describe, expect, it } from "vitest"
import { PAGE_HTML } from "./page.js"
import { plainQuestion, startWebServer, type WebEvent, type WebSession } from "./server.js"

const open: WebSession[] = []
const start = async (): Promise<WebSession> => {
  const s = await startWebServer()
  open.push(s)
  return s
}
afterEach(async () => {
  for (const s of open.splice(0)) await s.close()
})

const parts = (s: WebSession) => {
  const u = new URL(s.url)
  return { origin: u.origin, token: u.searchParams.get("t") as string, host: u.host }
}
/** A raw request, so the Host and Origin headers can be set to anything. */
const raw = (s: WebSession, path: string, headers: Record<string, string>, method = "GET", body?: string) =>
  new Promise<{ status: number; body: string }>((resolve, reject) => {
    const { host } = parts(s)
    const [h, p] = host.split(":")
    const req = request({ host: h, port: Number(p), path, method, headers }, (res) => {
      let text = ""
      res.on("data", (d) => {
        text += d
      })
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: text }))
    })
    req.on("error", reject)
    req.end(body)
  })
/** The next event of a type, read from the live event stream. */
async function nextEvent(s: WebSession, type: string): Promise<WebEvent & { id: string }> {
  const { origin, token } = parts(s)
  const res = await fetch(`${origin}/api/events?t=${token}`)
  const reader = (res.body as ReadableStream<Uint8Array>).getReader()
  let buf = ""
  for (;;) {
    const { value, done } = await reader.read()
    if (done) throw new Error("stream ended")
    buf += new TextDecoder().decode(value)
    for (const block of buf.split("\n\n")) {
      const data = /^data: (.*)$/m.exec(block)?.[1]
      if (!data) continue
      const e = JSON.parse(data) as WebEvent & { id: string }
      if (e.type === type) {
        await reader.cancel()
        return e
      }
    }
  }
}
const answer = (s: WebSession, id: string, value: unknown) => {
  const { origin, token } = parts(s)
  return fetch(`${origin}/api/answer?t=${token}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ id, value })
  })
}

describe("the local setup server", () => {
  it("listens on the loopback address and serves the page only with the token", async () => {
    const s = await start()
    const { origin, token } = parts(s)
    expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    const ok = await fetch(`${origin}/?t=${token}`)
    expect(ok.status).toBe(200)
    expect(ok.headers.get("content-security-policy")).toMatch(/default-src 'none'/)
    const page = await ok.text()
    expect(page).toContain("invariant")
    // The scan scene is there, and it stops moving for people who ask for less motion.
    expect(page).toContain('id="scene"')
    expect(page).toContain('id="finScene"')
    expect(page).toContain("Setting things up")
    expect(page).toContain('id="sumSkel"')
    expect(page).toContain('role="progressbar"')
    expect(page).toContain("prefers-reduced-motion")
    expect((await fetch(`${origin}/`)).status).toBe(403)
    expect((await fetch(`${origin}/?t=${"0".repeat(token.length)}`)).status).toBe(403)
    expect((await fetch(`${origin}/api/events?t=nope`)).status).toBe(403)
  })

  it("refuses a request that names another host or comes from another origin", async () => {
    const s = await start()
    const { token } = parts(s)
    // DNS rebinding: the browser sends the attacker's name as the Host.
    expect((await raw(s, `/?t=${token}`, { host: "evil.example:80" })).status).toBe(403)
    const { host } = parts(s)
    expect((await raw(s, `/?t=${token}`, { host, origin: "https://evil.example" })).status).toBe(403)
    expect(
      (await raw(s, `/api/stop?t=${token}`, { host, origin: "https://evil.example" }, "POST", "{}")).status
    ).toBe(403)
  })

  it("relays a question and checks the answer against the choices", async () => {
    const s = await start()
    const picked = s.select("Looks right?", [
      { value: "yes", label: "Yes", key: "y" },
      { value: "no", label: "No", key: "n" }
    ])
    const ask = await nextEvent(s, "ask")
    expect(ask).toMatchObject({ kind: "select", question: "Looks right?" })
    expect((await answer(s, ask.id as string, "maybe")).status).toBe(400)
    expect((await answer(s, "q999", "yes")).status).toBe(409)
    expect((await answer(s, (ask as { id: string }).id, "no")).status).toBe(204)
    expect(await picked).toBe("no")
  })

  it("accepts only ticked values that were in the list, for a tree and a checklist", async () => {
    const s = await start()
    const chosen = s.tree("Which?", [
      {
        label: "g",
        items: [
          { value: "a", label: "A" },
          { value: "b", label: "B", ticked: false }
        ]
      }
    ])
    const ask = (await nextEvent(s, "ask")) as {
      id: string
      kind: string
      groups: Array<{ items: Array<{ ticked: boolean }> }>
    }
    expect(ask.kind).toBe("tree")
    expect(ask.groups[0]?.items.map((i) => i.ticked)).toEqual([true, false])
    expect((await answer(s, ask.id, ["a", "zzz"])).status).toBe(400)
    expect((await answer(s, ask.id, "a")).status).toBe(400)
    expect((await answer(s, ask.id, ["b", "b"])).status).toBe(204)
    expect(await chosen).toEqual(["b"])
  })

  it("stop cancels the open question and every one after it", async () => {
    const s = await start()
    const first = s.prompt("Name?")
    await nextEvent(s, "ask")
    const { origin, token } = parts(s)
    expect(
      (await fetch(`${origin}/api/stop?t=${token}`, { method: "POST", headers: { origin } })).status
    ).toBe(204)
    expect(await first).toBeUndefined()
    expect(s.stopped).toBe(true)
    expect(await s.prompt("Again?")).toBeUndefined()
  })

  it("start over cancels the open question, then asks again after reset", async () => {
    const s = await start()
    const first = s.prompt("Name?")
    await nextEvent(s, "ask")
    const { origin, token } = parts(s)
    expect(
      (await fetch(`${origin}/api/restart?t=${token}`, { method: "POST", headers: { origin } })).status
    ).toBe(204)
    expect(await first).toBeUndefined()
    expect(s.restarting).toBe(true)
    expect(s.stopped).toBe(false)
    expect(await s.prompt("Still cancelled?")).toBeUndefined()
    s.reset()
    expect(s.restarting).toBe(false)
    const again = s.prompt("Name again?")
    // The first question was q1; the one refused while restarting took no id.
    expect((await answer(s, "q2", "ana")).status).toBe(204)
    expect(await again).toBe("ana")
  })

  it("start over is refused for a wrong host or origin, and once setup was stopped", async () => {
    const s = await start()
    const { origin, token } = parts(s)
    expect(
      (await raw(s, `/api/restart?t=${token}`, { host: "127.0.0.1:1", origin }, "POST", "{}")).status
    ).toBe(403)
    const { host } = parts(s)
    expect(
      (await raw(s, `/api/restart?t=${token}`, { host, origin: "https://evil.example" }, "POST", "{}")).status
    ).toBe(403)
    await fetch(`${origin}/api/stop?t=${token}`, { method: "POST", headers: { origin } })
    expect(
      (await fetch(`${origin}/api/restart?t=${token}`, { method: "POST", headers: { origin } })).status
    ).toBe(409)
  })

  it("replays what already happened to a browser that connects late", async () => {
    const s = await start()
    s.emit({ type: "phase", id: "scan", title: "Scan" })
    s.emit({ type: "log", kind: "step", text: "scanned 3 files" })
    const e = await nextEvent(s, "log")
    expect(e).toMatchObject({ kind: "step", text: "scanned 3 files" })
  })
})

describe("the review inside setup", () => {
  const api = {
    state: async () => ({
      project: "demo",
      contract: { name: "x", components: 0, tokens: 0, patterns: 0, guidelines: 0 },
      decisionsFile: "invariant.decisions.json",
      rows: []
    }),
    decide: async () => ({ ok: true as const }),
    apply: async () => ({ ok: true as const })
  }

  it("serves the review page and its API from the setup server, framed by the setup page only", async () => {
    const s = await startWebServer({ review: api })
    open.push(s)
    const { origin, token } = parts(s)
    const setup = await fetch(`${origin}/?t=${token}`)
    expect(setup.headers.get("content-security-policy")).toMatch(/frame-src 'self'/)
    expect(setup.headers.get("content-security-policy")).toMatch(/frame-ancestors 'none'/)
    const review = await fetch(`${origin}/review?t=${token}`)
    expect(review.status).toBe(200)
    expect(review.headers.get("content-security-policy")).toMatch(/frame-ancestors 'self'/)
    expect((await fetch(`${origin}/review`)).status).toBe(403)
    expect((await fetch(`${origin}/api/state?t=${token}`)).status).toBe(200)
    expect((await raw(s, `/api/state?t=${token}`, { host: "evil.example:80" })).status).toBe(403)
  })

  it("has no review page or API without one", async () => {
    const s = await start()
    const { origin, token } = parts(s)
    expect((await fetch(`${origin}/review?t=${token}`)).status).toBe(404)
    expect((await fetch(`${origin}/api/state?t=${token}`)).status).toBe(404)
    expect((await fetch(`${origin}/?t=${token}`)).headers.get("content-security-policy")).not.toMatch(
      /frame-src/
    )
  })

  it("asks to go on, and only accepts that answer", async () => {
    const s = await startWebServer({ review: api })
    open.push(s)
    const went = s.review("Review what needs a decision")
    const ask = (await nextEvent(s, "ask")) as { id: string; kind: string }
    expect(ask.kind).toBe("review")
    expect((await answer(s, ask.id, "skip")).status).toBe(400)
    expect((await answer(s, ask.id, "continue")).status).toBe(204)
    expect(await went).toBe("continue")
  })
})

describe("question text", () => {
  it("is plain: no color codes and no frame glyphs", () => {
    expect(plainQuestion("\u001b[36m◆\u001b[0m  Looks right? [Y/n] ")).toBe("Looks right? [Y/n]")
    expect(plainQuestion("◆  Rename one?\n│  1. Card\n│  2. Dialog\n◆  Number: ")).toBe(
      "Rename one?\n1. Card\n2. Dialog\nNumber:"
    )
  })
})

describe("the page", () => {
  it("makes no request to another origin and puts server text in only as text", () => {
    expect(PAGE_HTML).not.toMatch(/https?:\/\//)
    expect(PAGE_HTML).not.toMatch(/<script[^>]+src=|<link[^>]+href=|@import|url\(/)
    expect(PAGE_HTML).not.toMatch(/\.innerHTML|insertAdjacentHTML|document\.write/)
  })

  it("has a script that parses, so the page is not blank", () => {
    const script = /<script>([\s\S]*?)<\/script>/.exec(PAGE_HTML)?.[1]
    expect(script).toBeDefined()
    expect(() => new Script(script as string)).not.toThrow()
  })

  it("uses the design tokens and the theme storage key from site/design.md", () => {
    for (const token of ["#0e0e0d", "#151514", "#2a2a27", "#ece9e2", "#9a968c", "#7c8cff", "#5eead4"])
      expect(PAGE_HTML).toContain(token)
    expect(PAGE_HTML).toContain('localStorage.getItem("theme")')
    expect(PAGE_HTML).toContain("prefers-color-scheme")
    expect(PAGE_HTML).toMatch(/border-radius:3px/)
    expect(PAGE_HTML).not.toMatch(/gradient|box-shadow|border-radius:\d{2,}px|backdrop-filter/)
  })
})
