import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import type { ReviewState } from "../review-data.js"
import { makeGuard, PAGE_HEADERS } from "./guard.js"
import { REVIEW_PAGE_HTML } from "./review-page.js"

export const ACTIONS = ["approve", "reject", "resolve", "accept", "dismiss"] as const
export type ReviewAction = (typeof ACTIONS)[number]

export interface DecideInput {
  id: string
  action: ReviewAction
  by: string
  note?: string
  source?: string
  role?: string
  reference?: string
}

export type Outcome = { ok: true; message?: string } | { ok: false; message: string }

/** What the page can ask for. The server checks the shape of each request; the CLI commands behind it check the rest. */
export interface ReviewApi {
  state(): Promise<ReviewState>
  decide(input: DecideInput): Promise<Outcome>
  apply(): Promise<Outcome>
}

export interface ReviewServer {
  url: string
  /** Settles when the person presses Done in the page, or the server is closed. */
  closed: Promise<void>
  close(): Promise<void>
}

const short = (v: unknown, max: number): string | undefined =>
  typeof v === "string" && v.trim() !== "" && v.length <= max ? v.trim() : undefined

/**
 * The local page for `invariant review list`. It has the same guards as the setup page (loopback, token, Host and Origin
 * checks, a CSP with no external request). It reads what the CLI already reads and records decisions through the same
 * commands a person would type: it adds no way to write files that those commands do not have.
 */
export async function startReviewServer(api: ReviewApi): Promise<ReviewServer> {
  let finish: () => void = () => {}
  const closed = new Promise<void>((resolve) => {
    finish = resolve
  })
  const server = createServer((req, res) => {
    void handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const guard = makeGuard((server.address() as AddressInfo).port)

  const send = (res: ServerResponse, code: number, body: unknown): void => {
    res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
    res.end(JSON.stringify(body))
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = guard.admit(req, res)
    if (!url) return
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, PAGE_HEADERS)
      res.end(REVIEW_PAGE_HTML)
      return
    }
    if (req.method === "GET" && url.pathname === "/api/state") return send(res, 200, await api.state())
    if (req.method === "POST" && url.pathname === "/api/decide") {
      let data: Record<string, unknown>
      try {
        data = JSON.parse((await guard.readBody(req)) ?? "") as Record<string, unknown>
      } catch {
        return guard.refuse(res, 400, "not JSON")
      }
      const action = ACTIONS.find((a) => a === data.action)
      const id = short(data.id, 300)
      const by = short(data.by, 200)
      if (!action || !id) return guard.refuse(res, 400, "that is not a decision")
      if (!by) return send(res, 200, { ok: false, message: "Say who is deciding (your name) first." })
      const note = short(data.note, 2000)
      const source = short(data.source, 100)
      const role = short(data.role, 200)
      const reference = short(data.reference, 500)
      return send(
        res,
        200,
        await api.decide({
          id,
          action,
          by,
          ...(note ? { note } : {}),
          ...(source ? { source } : {}),
          ...(role ? { role } : {}),
          ...(reference ? { reference } : {})
        })
      )
    }
    if (req.method === "POST" && url.pathname === "/api/apply") return send(res, 200, await api.apply())
    if (req.method === "POST" && url.pathname === "/api/close") {
      res.writeHead(204)
      res.end()
      finish()
      return
    }
    guard.refuse(res, 404, "not found")
  }

  return {
    url: guard.url,
    closed,
    async close() {
      finish()
      await new Promise<void>((r) => {
        server.close(() => r())
        server.closeAllConnections()
      })
    }
  }
}
