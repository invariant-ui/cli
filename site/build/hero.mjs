// Regenerates the hero terminal in site/index.html from real CLI output: `invariant init` then `invariant compile`
// run on a scratch copy of fixtures/react/design-system. Rewrites the keyframe block between the `demo:start` and
// `demo:end` markers and the terminal between the `demo:tty` markers. Usage (from the repo root, after `pnpm build`):
//   node site/build/hero.mjs
import { execFileSync } from "node:child_process"
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const CLI = "apps/cli/dist/main.js"
const FIXTURE = "fixtures/react/design-system"
const PAGE = "site/index.html"
const T = 18 // loop length in seconds, as in the page's animations
const END = 98.5 // percent: the loop holds here, then resets

if (!existsSync(CLI)) throw new Error(`${CLI} is missing; run pnpm build first`)

// 1. Real output: run the CLI in a scratch copy. stdout is piped, so there are no colors or escape codes.
const work = mkdtempSync(join(tmpdir(), "invariant-hero-"))
let init, compile
try {
  cpSync(resolve(FIXTURE), work, { recursive: true })
  const run = (...args) => execFileSync(process.execPath, [resolve(CLI), ...args], { cwd: work, encoding: "utf8" })
  init = run("init").split("\n").filter((l) => l !== "")
  compile = run("compile").split("\n").filter((l) => l !== "")
} finally {
  rmSync(work, { recursive: true, force: true })
}

// 2. Timeline, in seconds from the start of the loop.
const pct = (s) => ((s / T) * 100).toFixed(2)
const plus = (s, d) => (((s + d) / T) * 100).toFixed(2)
const TIMES = {
  initType: [0.7, 2.3], // "invariant init" typed
  initOut: 2.7, // first init output line; then one every 0.3s
  promptTwo: 3.9,
  compileType: [4.1, 6.1], // "invariant compile" typed
  busy: 6.4, // spinner starts
  done: 8.5, // header line shown, compile output follows
  lineStep: 0.22
}
TIMES.promptThree = TIMES.done + TIMES.lineStep * compile.length + 0.4

const fadeIn = (name, s) => `@keyframes ${name}{0%,${pct(s)}%{opacity:0}${plus(s, 0.3)}%,${END}%{opacity:1}98.6%,100%{opacity:0}}`
const fadeWindow = (name, a, b) =>
  `@keyframes ${name}{0%,${pct(a)}%{opacity:0}${plus(a, 0.3)}%,${pct(b)}%{opacity:1}${plus(b, 0.3)}%,100%{opacity:0}}`
const typing = (name, [s, e], chars) =>
  `@keyframes ${name}{0%{width:0}${pct(s)}%{width:0ch;animation-timing-function:steps(${chars})}${pct(e)}%,${END}%{width:${chars}ch}98.6%,100%{width:0}}`

// 3. Terminal markup and the keyframes its classes use.
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const warnings = (s) => s.replace(/(\d+) warnings?/g, (m, n) => (n === "0" ? m : `<span class="w">${m}</span>`))
const frameLine = (text) => {
  const rest = (t) => warnings(esc(t))
  if (text.startsWith("┌")) return `<span class="c">┌</span>  <b>${rest(text.slice(3))}</b>`
  if (text.startsWith("◇")) return `<span class="ok">◇</span>  ${rest(text.slice(3))}`
  if (text.startsWith("└")) return `<span class="c">└</span>  <span class="ok">${rest(text.slice(3))}</span>`
  if (text.startsWith("│  report  ")) return `<span class="c">│</span>  <span class="c">report</span>  ${rest(text.slice(11))}`
  if (text.startsWith("│")) return `<span class="c">│</span>${rest(text.slice(1))}`
  return rest(text)
}

const rows = []
rows.push(`<span class="tl"><span class="p">$ </span><span class="ty t1">invariant init</span><span class="cw cw1"><span class="cursor"></span></span></span>`)
const initIds = init.map((line, i) => {
  const id = `h${i}`
  rows.push(`<span class="tl o ${id}"><span class="c">${esc(line)}</span></span>`)
  return id
})
rows.push(`<span class="tl pl2"><span class="p">$ </span><span class="ty t2">invariant compile</span><span class="cw cw2"><span class="cursor"></span></span></span>`)
rows.push(`<span class="tl sw"><span class="spin"><span class="spn"></span> compiling&hellip;</span><span class="dn">${frameLine(compile[0])}</span></span>`)
const compileIds = compile.slice(1).map((line, i) => {
  const id = `c${i + 1}`
  rows.push(`<span class="tl o ${id}">${frameLine(line)}</span>`)
  return id
})
rows.push(`<span class="tl pl3"><span class="p">$ </span><span class="cw cw3"><span class="cursor"></span></span></span>`)
const tty = `<pre class="tty" aria-label="Terminal demo: invariant init, then invariant compile">${rows.join("")}</pre>`

const html = readFileSync(PAGE, "utf8")
const contractAt = html.indexOf('<div class="contract"')
const contractPre = html.slice(contractAt, html.indexOf("</pre>", contractAt))
const contractLines = (contractPre.match(/class="cl[ "]/g) ?? []).length

// 4. Keyframes.
const css = []
css.push(typing("ty1", TIMES.initType, "invariant init".length))
css.push(".t1{animation:ty1 18s infinite}")
css.push(typing("ty2", TIMES.compileType, "invariant compile".length))
css.push(".t2{animation:ty2 18s infinite}")
css.push(fadeWindow("w1", 0, TIMES.initOut - 0.2))
css.push(".cw1{opacity:0;animation:w1 18s infinite}")
css.push(fadeWindow("w2", TIMES.promptTwo, TIMES.busy - 0.2))
css.push(".cw2{opacity:0;animation:w2 18s infinite}")
css.push(fadeWindow("w3", TIMES.promptThree, (END * T) / 100))
css.push(".cw3{opacity:0;animation:w3 18s infinite}")
initIds.forEach((id, i) => {
  css.push(fadeIn(`k${id}`, TIMES.initOut + i * 0.3))
  css.push(`.${id}{opacity:0;animation:k${id} 18s infinite}`)
})
css.push(fadeIn("kpl2", TIMES.promptTwo))
css.push(".pl2{opacity:0;animation:kpl2 18s infinite}")
css.push(fadeIn("kpl3", TIMES.promptThree))
css.push(".pl3{opacity:0;animation:kpl3 18s infinite}")
css.push(fadeIn("kdn", TIMES.done))
css.push(".dn{opacity:0;animation:kdn 18s infinite}")
css.push(fadeWindow("kspin", TIMES.busy, TIMES.done))
css.push(".spin{opacity:0;animation:kspin 18s infinite}")
compileIds.forEach((id, i) => {
  css.push(fadeIn(`k${id}`, TIMES.done + TIMES.lineStep * (i + 1)))
  css.push(`.${id}{opacity:0;animation:k${id} 18s infinite}`)
})
css.push(fadeWindow("ks1", 0, TIMES.busy))
css.push(fadeWindow("ks2", TIMES.busy, TIMES.done))
css.push(fadeIn("ks3", TIMES.done))
css.push(".st .s1{opacity:0;animation:ks1 18s infinite}")
css.push(".st .s2{opacity:0;animation:ks2 18s infinite}")
css.push(".st .s3{opacity:0;animation:ks3 18s infinite}")
css.push(`@keyframes tglow{0%,${pct(0.6)}%{border-color:var(--line);box-shadow:0 30px 80px -30px rgba(124,140,255,.35)}${pct(0.8)}%,${pct(TIMES.busy)}%{border-color:var(--accent2);box-shadow:0 0 0 1px rgba(94,234,212,.35),0 30px 80px -30px rgba(94,234,212,.5)}${plus(TIMES.busy, 0.2)}%,100%{border-color:var(--line);box-shadow:0 30px 80px -30px rgba(124,140,255,.35)}}`)
css.push(`@keyframes cglow{0%,${pct(TIMES.busy - 0.2)}%{border-color:var(--line);box-shadow:0 30px 80px -30px rgba(124,140,255,.35)}${pct(TIMES.busy)}%,${pct(TIMES.done + 5.5)}%{border-color:var(--accent);box-shadow:0 0 0 1px rgba(124,140,255,.5),0 30px 90px -25px rgba(124,140,255,.7)}${pct(TIMES.done + 7.5)}%,100%{border-color:var(--line);box-shadow:0 30px 80px -30px rgba(124,140,255,.35)}}`)
css.push(".stage .term{animation:tglow 18s infinite}.stage .contract{animation:cglow 18s infinite}")
css.push("@keyframes tfade{0%,96.5%{opacity:1}97.8%,99%{opacity:0}100%{opacity:1}}")
css.push(".tty{animation:tfade 18s infinite}")
for (let k = 0; k < contractLines; k++) {
  const a = TIMES.done + 0.1 + k * 0.2
  css.push(
    `@keyframes c${k}{0%,${pct(a)}%{opacity:.12;background:transparent}${plus(a, 0.3)}%{opacity:1;background:color-mix(in srgb,var(--accent) 35%,transparent)}${plus(a, 1.0)}%{background:transparent}${END}%{opacity:1}98.6%,100%{opacity:.12;background:transparent}}`
  )
  css.push(`.cl:nth-child(${k + 1}){animation:c${k} 18s infinite}`)
}

// 5. Write the two generated regions.
const block = `/* demo:start (generated) */\n${css.join("\n")}\n/* demo:end */`
const cssRe = /\/\* demo:start \(generated[^)]*\) \*\/[\s\S]*?\/\* demo:end \*\//
const ttyRe = /<!-- demo:tty:start -->[\s\S]*?<!-- demo:tty:end -->/
if (!cssRe.test(html)) throw new Error(`demo:start markers not found in ${PAGE}`)
if (!ttyRe.test(html)) throw new Error(`demo:tty markers not found in ${PAGE}`)
writeFileSync(PAGE, html.replace(cssRe, () => block).replace(ttyRe, () => `<!-- demo:tty:start -->${tty}<!-- demo:tty:end -->`))
console.log(`hero: ${init.length} init lines, ${compile.length} compile lines, ${contractLines} contract lines, loop ${T}s`)
