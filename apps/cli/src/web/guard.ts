import { randomBytes, timingSafeEqual } from "node:crypto"
import type { IncomingMessage, ServerResponse } from "node:http"

/** The headers every local page is sent with: no external request is allowed, and nothing may frame or sniff it. */
export const PAGE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "content-security-policy":
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff"
} as const

export const MAX_BODY = 2 * 1024 * 1024

export interface Guard {
  /** The address to open, with the token that lets this browser in. */
  url: string
  /** Answers 403 itself and returns undefined unless the Host, the Origin and the token are right. */
  admit(req: IncomingMessage, res: ServerResponse): URL | undefined
  refuse(res: ServerResponse, code: number, why: string): void
  readBody(req: IncomingMessage): Promise<string | undefined>
}

/**
 * What every local page in this CLI shares: it listens on the loopback address only, needs the random token in the link,
 * and checks the Host header (so a page on another site cannot reach it through DNS rebinding) and the Origin header
 * on every request.
 */
export function makeGuard(port: number): Guard {
  const token = randomBytes(24).toString("hex")
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])
  const tokenOk = (given: string | null): boolean => {
    if (!given || given.length !== token.length) return false
    return timingSafeEqual(Buffer.from(given), Buffer.from(token))
  }
  const refuse = (res: ServerResponse, code: number, why: string): void => {
    res.writeHead(code, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" })
    res.end(`${why}\n`)
  }
  return {
    url: `http://127.0.0.1:${port}/?t=${token}`,
    refuse,
    admit(req, res) {
      if (!hosts.has(req.headers.host ?? "")) return void refuse(res, 403, "wrong host")
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`)
      const origin = req.headers.origin
      if (origin !== undefined && !hosts.has(origin.replace(/^https?:\/\//, "")))
        return void refuse(res, 403, "wrong origin")
      if (!tokenOk(url.searchParams.get("t")))
        return void refuse(res, 403, "Open the link that was printed in your terminal.")
      return url
    },
    readBody: (req) =>
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
  }
}
