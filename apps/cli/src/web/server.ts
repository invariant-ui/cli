import { randomBytes, timingSafeEqual } from "node:crypto"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import type { Choice, Option, TreeGroup } from "../select.js"
import { PAGE_HTML } from "./page.js"

/** What the browser is told. Every field is plain data; the page renders text with `textContent` only. */
export type WebEvent =
  | { type: "phase"; id: string; title: string }
  | { type: "log"; kind: "step" | "say" | "flag"; text: string }
  | { type: "busy"; text: string | null }
  | { type: "next"; title: string; lines: string[] }
  | {
      type: "ask"
      id: string
      kind: "select" | "multiselect" | "tree" | "prompt"
      question: string
      choices?: Array<{ value: string; label: string; key: string }>
      options?: Array<{ value: string; label: string; ticked: boolean }>
      groups?: Array<{
        label: string
        bare: boolean
        collapsed: boolean
        items: Array<{ value: string; label: string; ticked: boolean }>
      }>
    }
  | { type: "answered"; id: string }
  | { type: "project"; name: string }
  | { type: "reset" }
  | { type: "done"; code: number }
  | { type: "error"; message: string }

interface Pending {
  /** Returns the answer in the shape the caller wants, or undefined when the browser sent something invalid. */
  check(value: unknown): { ok: true; value: unknown } | { ok: false }
  resolve(value: unknown): void
}

export interface WebSession {
  /** The address to open, with the token that lets this browser in. */
  url: string
  prompt(question: string): Promise<string | undefined>
  select<T extends string>(question: string, choices: ReadonlyArray<Choice<T>>): Promise<T | undefined>
  multiselect<T extends string>(question: string, options: ReadonlyArray<Option<T>>): Promise<T[] | undefined>
  tree<T extends string>(question: string, groups: ReadonlyArray<TreeGroup<T>>): Promise<T[] | undefined>
  emit(event: WebEvent): void
  /** True once the person pressed Stop in the browser. Every later question answers "cancelled". */
  readonly stopped: boolean
  /** True once the person asked to start over. Every question answers "cancelled" until `reset()`. */
  readonly restarting: boolean
  /** Tells the browser a new run begins, and lets questions be asked again. */
  reset(): void
  /** Tells the browser the run ended, lets it receive that, and closes the server. */
  finish(code: number, error?: string): Promise<void>
  close(): Promise<void>
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: this removes terminal escape sequences from a question
const ESCAPES = /\u001b\[[0-9;?]*[ -/]*[@-~]/g

/** A terminal question as plain text: no colors, and no frame glyphs at the start of a line. */
export const plainQuestion = (q: string): string =>
  q
    .replace(ESCAPES, "")
    .split("\n")
    .map((l) => l.replace(/^[◆│]\s{1,2}/, ""))
    .join("\n")
    .trim()

const MAX_BODY = 2 * 1024 * 1024

/**
 * A local web page that answers the questions `invariant setup` would ask in the terminal. It listens on the loopback
 * address only, needs the random token in the link, checks the Host and Origin headers (so a page on another site cannot
 * drive it), and validates every answer against the question that was asked. It serves one fixed page and relays answers;
 * it reads no file and runs nothing.
 */
export async function startWebServer(options: { port?: number } = {}): Promise<WebSession> {
  const token = randomBytes(24).toString("hex")
  const events: Array<{ id: number; event: WebEvent }> = []
  const clients = new Set<ServerResponse>()
  const pending = new Map<string, Pending>()
  let nextAsk = 1
  let stopped = false
  let restarting = false
  let closed = false

  const send = (res: ServerResponse, id: number, event: WebEvent): void => {
    res.write(`id: ${id}\ndata: ${JSON.stringify(event)}\n\n`)
  }
  const emit = (event: WebEvent): void => {
    const id = events.length + 1
    events.push({ id, event })
    for (const res of clients) send(res, id, event)
  }

  const server: Server = createServer((req, res) => {
    void handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(options.port ?? 0, "127.0.0.1", resolve)
  })
  const port = (server.address() as AddressInfo).port
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])

  const tokenOk = (given: string | null): boolean => {
    if (!given || given.length !== token.length) return false
    return timingSafeEqual(Buffer.from(given), Buffer.from(token))
  }
  const refuse = (res: ServerResponse, code: number, why: string): void => {
    res.writeHead(code, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" })
    res.end(`${why}\n`)
  }
  const readBody = (req: IncomingMessage): Promise<string | undefined> =>
    new Promise((resolve) => {
      const chunks: Buffer[] = []
      let size = 0
      req.on("data", (d: Buffer) => {
        size += d.length
        if (size > MAX_BODY) {
          req.destroy()
          resolve(undefined)
        } else chunks.push(d)
      })
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
      req.on("error", () => resolve(undefined))
    })

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!hosts.has(req.headers.host ?? "")) return refuse(res, 403, "wrong host")
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`)
    const origin = req.headers.origin
    if (origin !== undefined && !hosts.has(origin.replace(/^https?:\/\//, "")))
      return refuse(res, 403, "wrong origin")
    if (!tokenOk(url.searchParams.get("t")))
      return refuse(res, 403, "Open the link that invariant setup printed in your terminal.")

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy":
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff"
      })
      res.end(PAGE_HTML)
      return
    }
    if (req.method === "GET" && url.pathname === "/api/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        connection: "keep-alive"
      })
      res.write("retry: 1000\n\n")
      const last = Number(req.headers["last-event-id"] ?? 0)
      for (const e of events) if (e.id > last) send(res, e.id, e.event)
      clients.add(res)
      const beat = setInterval(() => res.write(": keep-alive\n\n"), 15000)
      req.on("close", () => {
        clearInterval(beat)
        clients.delete(res)
      })
      return
    }
    if (req.method === "POST" && url.pathname === "/api/answer") {
      const body = await readBody(req)
      let data: { id?: unknown; value?: unknown }
      try {
        data = JSON.parse(body ?? "") as { id?: unknown; value?: unknown }
      } catch {
        return refuse(res, 400, "not JSON")
      }
      const ask = typeof data.id === "string" ? pending.get(data.id) : undefined
      if (!ask || typeof data.id !== "string") return refuse(res, 409, "no such question")
      const checked = ask.check(data.value)
      if (!checked.ok) return refuse(res, 400, "that answer is not one of the choices")
      pending.delete(data.id)
      emit({ type: "answered", id: data.id })
      ask.resolve(checked.value)
      res.writeHead(204)
      res.end()
      return
    }
    if (req.method === "POST" && url.pathname === "/api/stop") {
      stopped = true
      for (const [id, ask] of [...pending]) {
        pending.delete(id)
        ask.resolve(undefined)
      }
      res.writeHead(204)
      res.end()
      return
    }
    if (req.method === "POST" && url.pathname === "/api/restart") {
      if (stopped || closed) return refuse(res, 409, "setup has ended")
      restarting = true
      for (const [id, ask] of [...pending]) {
        pending.delete(id)
        ask.resolve(undefined)
      }
      res.writeHead(204)
      res.end()
      return
    }
    refuse(res, 404, "not found")
  }

  /** Asks the browser and waits. Resolves undefined when the person stops. */
  const ask = <R>(event: (id: string) => WebEvent, check: Pending["check"]): Promise<R | undefined> => {
    if (stopped || restarting || closed) return Promise.resolve(undefined)
    const id = `q${nextAsk++}`
    return new Promise<R | undefined>((resolve) => {
      pending.set(id, { check, resolve: resolve as (v: unknown) => void })
      emit(event(id))
    })
  }
  const text = (v: unknown, max = 10000): { ok: true; value: unknown } | { ok: false } =>
    typeof v === "string" && v.length <= max ? { ok: true, value: v } : { ok: false }
  const subsetOf =
    (allowed: Set<string>) =>
    (v: unknown): { ok: true; value: unknown } | { ok: false } =>
      Array.isArray(v) && v.every((x) => typeof x === "string" && allowed.has(x))
        ? { ok: true, value: [...new Set(v as string[])] }
        : { ok: false }

  const session: WebSession = {
    url: `http://127.0.0.1:${port}/?t=${token}`,
    get stopped() {
      return stopped
    },
    get restarting() {
      return restarting
    },
    reset() {
      restarting = false
      emit({ type: "reset" })
    },
    emit,
    prompt: (question) =>
      ask<string>(
        (id) => ({ type: "ask", id, kind: "prompt", question: plainQuestion(question) }),
        (v) => text(v)
      ),
    select: <T extends string>(question: string, choices: ReadonlyArray<Choice<T>>) => {
      const allowed = new Set<string>(choices.map((c) => c.value))
      return ask<T>(
        (id) => ({
          type: "ask",
          id,
          kind: "select",
          question: plainQuestion(question),
          choices: choices.map((c) => ({ value: c.value, label: plainQuestion(c.label), key: c.key }))
        }),
        (v) => (typeof v === "string" && allowed.has(v) ? { ok: true, value: v } : { ok: false })
      )
    },
    multiselect: <T extends string>(question: string, options: ReadonlyArray<Option<T>>) =>
      ask<T[]>(
        (id) => ({
          type: "ask",
          id,
          kind: "multiselect",
          question: plainQuestion(question),
          options: options.map((o) => ({
            value: o.value,
            label: plainQuestion(o.label),
            ticked: o.ticked !== false
          }))
        }),
        subsetOf(new Set<string>(options.map((o) => o.value)))
      ),
    tree: <T extends string>(question: string, groups: ReadonlyArray<TreeGroup<T>>) =>
      ask<T[]>(
        (id) => ({
          type: "ask",
          id,
          kind: "tree",
          question: plainQuestion(question),
          groups: groups.map((g) => ({
            label: plainQuestion(g.label),
            bare: g.bare === true,
            collapsed: g.collapsed === true,
            items: g.items.map((i) => ({
              value: i.value,
              label: plainQuestion(i.label),
              ticked: i.ticked !== false
            }))
          }))
        }),
        subsetOf(new Set<string>(groups.flatMap((g) => g.items.map((i) => i.value))))
      ),
    async finish(code, error) {
      if (error) emit({ type: "error", message: error })
      emit({ type: "done", code })
      // Long enough for the browser to read the last events; the page keeps what it has once the server is gone.
      await new Promise((r) => setTimeout(r, 400))
      await session.close()
    },
    async close() {
      if (closed) return
      closed = true
      for (const [id, a] of [...pending]) {
        pending.delete(id)
        a.resolve(undefined)
      }
      for (const res of clients) res.end()
      clients.clear()
      await new Promise<void>((r) => {
        server.close(() => r())
        server.closeAllConnections()
      })
    }
  }
  return session
}
