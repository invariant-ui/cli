// Records `invariant setup` in the browser: the real CLI and the real local page, driven in headless Chrome.
//   pnpm build && node scripts/demo-web-setup.ts
// Writes docs/demo/setup-web.mp4, setup-web.webm and setup-web-poster.png. Needs Chrome and ffmpeg.
import { execFileSync, spawn } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { createServer, request } from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
// The built CLI, as `pnpm demo` runs it (this script is plain Node, so it does not use the workspace aliases).
const { run } = (await import(path.join(root, "apps/cli/dist/index.js"))) as {
  run: (argv: string[], io: never) => Promise<number>
}
const out = process.env.DEMO_OUT ?? path.join(root, "docs/demo")
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const W = 1280
const H = 800
const PORT = 9333

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const work = mkdtempSync(path.join(tmpdir(), "invariant-demo-web-"))

// ---- the project: a design system with Storybook plus an app that uses it ----
const project = path.join(work, "banking")
cpSync(path.join(root, "fixtures/storybook/acme-ui"), project, {
  recursive: true,
  filter: (s) => !s.includes("storybook-static")
})
cpSync(path.join(root, "fixtures/pattern-discovery/app"), path.join(project, "app"), { recursive: true })

// ---- Chrome and a minimal DevTools client ----
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--window-size=${W},${H}`,
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--no-first-run",
    "--disable-gpu",
    `--user-data-dir=${path.join(work, "chrome")}`,
    "about:blank"
  ],
  { stdio: "ignore" }
)
let targets: Array<{ type: string; webSocketDebuggerUrl: string }> = []
for (let i = 0; i < 50 && targets.length === 0; i++) {
  await sleep(200)
  try {
    targets = ((await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()) as typeof targets).filter(
      (t) => t.type === "page"
    )
  } catch {}
}
if (targets.length === 0) throw new Error("Chrome did not start. Set CHROME to its path.")
const ws = new WebSocket((targets[0] as (typeof targets)[number]).webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener("open", r, { once: true }))
let nextId = 1
const waiting = new Map<number, (v: unknown) => void>()
ws.addEventListener("message", (m) => {
  const msg = JSON.parse(String(m.data)) as { id?: number; result?: unknown }
  if (msg.id !== undefined) waiting.get(msg.id)?.(msg.result)
})
const cdp = (method: string, params: object = {}): Promise<Record<string, unknown>> =>
  new Promise((resolve) => {
    const id = nextId++
    // A call Chrome never answers (it can happen to a screenshot while the page is busy) must not stop the recording.
    const timer = setTimeout(() => resolve({}), 8000)
    waiting.set(id, (v) => {
      clearTimeout(timer)
      resolve((v ?? {}) as Record<string, unknown>)
    })
    ws.send(JSON.stringify({ id, method, params }))
  })
const evaluate = async <T>(expression: string): Promise<T> => {
  const r = (await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })) as {
    result?: { value?: T }
  }
  return r.result?.value as T
}
await cdp("Page.enable")
await cdp("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false })
// Light or dark follows the demo's choice, so the recording does not depend on the machine it ran on.
await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] })

// ---- frames ----
const frames: Array<{ file: string; at: number }> = []
const framesDir = path.join(work, "frames")
mkdirSync(framesDir)
let recording = false
let t0 = 0
let capture: Promise<void> = Promise.resolve()
// Started once the page has loaded: Chrome does not answer a screenshot of the blank first page.
const startCapture = (): void => {
  recording = true
  t0 = Date.now()
  capture = (async () => {
    let n = 0
    while (recording) {
      const r = (await cdp("Page.captureScreenshot", { format: "png" })) as { data?: string }
      if (r.data) {
        const file = path.join(framesDir, `f${String(n++).padStart(5, "0")}.png`)
        writeFileSync(file, Buffer.from(r.data, "base64"))
        frames.push({ file, at: Date.now() - t0 })
      }
    }
  })()
}

// ---- a visible pointer, and real clicks ----
const CURSOR = `(() => {
  if (document.getElementById("demoCursor")) return;
  const c = document.createElement("div");
  c.id = "demoCursor";
  c.style.cssText = "position:fixed;left:40px;top:40px;width:18px;height:18px;z-index:99999;pointer-events:none;transition:left .55s ease,top .55s ease";
  c.innerHTML = '<svg viewBox="0 0 18 18" width="18" height="18"><path d="M2 1l12 7-5.2 1.3L6.6 15z" fill="#fff" stroke="#000" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  document.body.appendChild(c);
})()`
const center = (selector: string, text?: string): Promise<{ x: number; y: number } | null> =>
  evaluate(`(() => {
    const all = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const el = ${text ? `all.find((e) => e.textContent.trim().startsWith(${JSON.stringify(text)}))` : "all[0]"};
    if (!el) return null;
    el.scrollIntoView({ block: "nearest" });
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + Math.min(r.width / 2, 40)), y: Math.round(r.top + r.height / 2) };
  })()`)
async function click(selector: string, text?: string): Promise<boolean> {
  const at = await center(selector, text)
  if (!at) return false
  await evaluate(CURSOR)
  await evaluate(
    `(() => { const c = document.getElementById("demoCursor"); c.style.left = "${at.x}px"; c.style.top = "${at.y}px"; })()`
  )
  await sleep(450)
  await cdp("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: at.x,
    y: at.y,
    button: "left",
    clickCount: 1
  })
  await cdp("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: at.x,
    y: at.y,
    button: "left",
    clickCount: 1
  })
  await sleep(250)
  return true
}
// A click on something inside the review frame: the element's place in the frame plus the frame's place in the page.
async function clickInFrame(selector: string): Promise<void> {
  const at = await evaluate<{ x: number; y: number } | null>(`(() => {
    const f = document.querySelector(".rframe");
    const el = f.contentDocument.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    el.scrollIntoView({ block: "nearest" });
    const fr = f.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: Math.round(fr.left + r.left + Math.min(r.width / 2, 40)), y: Math.round(fr.top + r.top + r.height / 2) };
  })()`)
  if (!at) return
  await evaluate(CURSOR)
  await evaluate(
    `(() => { const c = document.getElementById("demoCursor"); c.style.left = "${at.x}px"; c.style.top = "${at.y}px"; })()`
  )
  await sleep(450)
  await cdp("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: at.x,
    y: at.y,
    button: "left",
    clickCount: 1
  })
  await cdp("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: at.x,
    y: at.y,
    button: "left",
    clickCount: 1
  })
  await sleep(250)
}
const waitFor = async (expression: string, ms = 60000): Promise<void> => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await evaluate<boolean>(`Boolean(${expression})`)) return
    await sleep(120)
  }
  throw new Error(`timed out waiting for ${expression}`)
}
const type = async (selector: string, text: string): Promise<void> => {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`)
  for (const ch of text) {
    await cdp("Input.dispatchKeyEvent", { type: "keyDown", text: ch })
    await cdp("Input.dispatchKeyEvent", { type: "keyUp", text: ch })
    await sleep(60)
  }
}

// ---- the real CLI, in this process, with its browser opened in the recorded Chrome ----
let opened: ((url: string) => void) | undefined
const pageUrl = new Promise<string>((r) => {
  opened = r
})
const cli = run(["setup", "--web", "--as", "ana", "--no-ci", "--no-agent"], {
  cwd: project,
  stdout: () => {},
  stderr: () => {},
  clock: () => "2026-01-01T00:00:00.000Z",
  env: { PATH: "" },
  select: async (_q: string, choices: ReadonlyArray<{ value: string }>) => choices[0]?.value,
  prompt: async () => undefined,
  openUrl: (url: string) => opened?.(url)
} as never)

const real = new URL(await pageUrl)

// For the recording only: the page reaches the real server through a small proxy that hands over the server's events
// one at a time, with pauses, so each step reads as work being done. The server, the setup code and every answer are
// the real ones; only the arrival of the events is spaced out. Product code has no such delay.
const PAUSE: Record<string, number> = { phase: 1100, log: 280, ask: 700, progress: 700, done: 600 }
const proxy = createServer((req, res) => {
  const headers = { ...req.headers, host: real.host }
  if (headers.origin) headers.origin = real.origin
  const up = request(
    { host: real.hostname, port: real.port, path: req.url, method: req.method, headers },
    (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers)
      if (!req.url?.startsWith("/api/events")) return void r.pipe(res)
      const queue: string[] = []
      let draining = false
      let ended = false
      const drain = async (): Promise<void> => {
        if (draining) return
        draining = true
        while (queue.length > 0) {
          const block = queue.shift() as string
          const type = /"type":"(\w+)"/.exec(block)?.[1] ?? ""
          await sleep(PAUSE[type] ?? 60)
          res.write(`${block}\n\n`)
        }
        draining = false
        if (ended) res.end()
      }
      let buf = ""
      r.on("data", (d: Buffer) => {
        buf += d.toString("utf8")
        const blocks = buf.split("\n\n")
        buf = blocks.pop() ?? ""
        for (const b of blocks) {
          // Comments and retry hints go straight through. The busy line repeats while the server waits: keep one at a time.
          if (!b.includes("data: ")) res.write(`${b}\n\n`)
          else if (b.includes('"type":"busy"') && queue.length > 0) continue
          else queue.push(b)
        }
        void drain()
      })
      r.on("end", () => {
        ended = true
        if (!draining) res.end()
      })
    }
  )
  // The real server closes when setup ends; a browser that asks again after that gets nothing.
  up.on("error", () => {
    if (!res.headersSent) res.writeHead(502)
    res.end()
  })
  req.pipe(up)
})
await new Promise<void>((r) => proxy.listen(0, "127.0.0.1", r))
const url = `http://127.0.0.1:${(proxy.address() as { port: number }).port}${real.pathname}${real.search}`
await cdp("Page.navigate", { url })
await waitFor(`document.getElementById("title")?.textContent`)
startCapture()
await evaluate(CURSOR)
await sleep(1200)

// Answer whatever is asked, the way a person accepting the sensible choices would, with pauses to read.
let asks = 0
let finished = false
void cli.then(() => {
  finished = true
})
while (!finished) {
  const kind = await evaluate<string>(`(() => {
    if (document.querySelector("#ask .rframe")) return "review";
    if (document.querySelector("#ask .tree")) return "tree:" + document.getElementById("title").textContent;
    if (document.querySelector("#ask .choices")) return "choice";
    if (document.querySelector("#ask input.field")) return "prompt";
    return "";
  })()`)
  if (kind)
    if (kind.startsWith("tree:")) {
      asks++
      await sleep(1000)
      if (asks === 1) {
        // Components: look for one, clear the filter, untick a component, then confirm.
        await click("#ask input.field")
        await type("#ask input.field", "Button")
        await sleep(900)
        await evaluate(
          `(() => { const f = document.querySelector("#ask input.field"); f.value = ""; f.dispatchEvent(new Event("input")); })()`
        )
        await sleep(600)
        await click("#ask .item input[type=checkbox]")
        await sleep(600)
        // The poster: the component list, with one unticked and the count in the footer.
        const shot = (await cdp("Page.captureScreenshot", { format: "png" })) as { data?: string }
        mkdirSync(out, { recursive: true })
        if (shot.data) writeFileSync(path.join(out, "setup-web-poster.png"), Buffer.from(shot.data, "base64"))
      } else await sleep(800)
      await click("#foot .btn.primary")
    } else if (kind === "review") {
      asks++
      // The review of conflicts, in a frame: read the report, say who is deciding, use one source for the first conflict,
      // apply it, and go on.
      await waitFor(
        `document.querySelector(".rframe")?.contentDocument?.querySelector(".claims .btn")`,
        20000
      )
      await sleep(1500)
      await evaluate(
        `(() => { const d = document.querySelector(".rframe").contentDocument; const b = d.getElementById("by"); b.value = "ana"; b.dispatchEvent(new Event("input")); })()`
      )
      await sleep(600)
      await clickInFrame(".claims .btn")
      await sleep(1500)
      await clickInFrame("#apply")
      await sleep(2200)
      await click("#foot .btn.primary")
    } else if (kind === "choice") {
      await sleep(800)
      await click("#ask .choices .btn.primary")
    } else if (kind === "prompt") {
      await sleep(500)
      await click("#ask .actions .btn.primary")
    } else await sleep(150)
}
await waitFor(`document.querySelector("#next li")`, 60000)
await sleep(1500)
// Scroll through the summary and the next steps.
for (let i = 0; i < 6; i++) {
  await evaluate(`window.scrollBy({ top: 260, behavior: "smooth" })`)
  await sleep(700)
}
await sleep(1000)
recording = false
await capture
await cli

// ---- the video ----
const list = frames
  .map((f, i) => {
    const next = frames[i + 1]?.at ?? f.at + 100
    return `file '${f.file}'\nduration ${((next - f.at) / 1000).toFixed(3)}`
  })
  .join("\n")
const lastFrame = frames.at(-1)?.file ?? ""
writeFileSync(path.join(work, "frames.txt"), `${list}\nfile '${lastFrame}'\n`)
mkdirSync(out, { recursive: true })
const input = ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(work, "frames.txt")]
execFileSync("ffmpeg", [
  ...input,
  "-vf",
  "fps=30,format=yuv420p",
  "-c:v",
  "libx264",
  "-crf",
  "24",
  "-preset",
  "slow",
  "-movflags",
  "+faststart",
  path.join(out, "setup-web.mp4")
])
execFileSync("ffmpeg", [
  ...input,
  "-vf",
  "fps=30",
  "-c:v",
  "libvpx-vp9",
  "-crf",
  "34",
  "-b:v",
  "0",
  path.join(out, "setup-web.webm")
])
console.log(`recorded ${frames.length} frames over ${((frames.at(-1)?.at ?? 0) / 1000).toFixed(1)}s`)

proxy.close()
chrome.kill()
await new Promise((r) => chrome.once("exit", r))
// Chrome may still be writing its profile for a moment.
rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
process.exit(0)
