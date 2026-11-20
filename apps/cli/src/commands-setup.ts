import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { scanPrompt } from "@invariant/agent-kit"
import { PATTERN_CATEGORIES } from "@invariant/contract"
import { PATTERNS_FILE } from "@invariant/governance"
import {
  CANDIDATES_FILE,
  type CandidatesFile,
  parseReviews,
  REVIEWS_FILE,
  type ReviewsFile
} from "@invariant/validation"
import { BASELINE_FILE } from "./baseline.js"
import { run } from "./cli.js"
import { type Context, json, outputDir, print, writableDir } from "./commands.js"
import { POSTURES } from "./commands-hook.js"
import { CONFIG_FILE, detectConfig, type InvariantConfig, loadConfig, writeConfig } from "./config.js"
import { CliError } from "./errors.js"
import { paint } from "./format.js"
import { columns, done, gap, intro, line, outro, spin, warn, wrap } from "./frame.js"
import { applyPublish, planPublish } from "./publish.js"
import type { Choice } from "./select.js"
import { inside } from "./setup-discovery.js"
import {
  type Agent,
  type AgentId,
  detectAgents,
  parseFindings,
  runAgent,
  scanSummary,
  withSuggestion
} from "./sources/agents.js"
import {
  applyDecisions,
  type ComponentSource,
  hasApproved,
  inScope,
  priorDecisions
} from "./sources/approval.js"
import { assess } from "./sources/confidence.js"
import { analyzePath, type DirectoryCandidate } from "./sources/discover.js"
import { analyzeProject, discoverFor } from "./sources/plan.js"
import { type Added, decideWithoutAsking, type ReviewResult, reviewSources } from "./sources/review.js"
import type { Scan } from "./sources/scan.js"
import { definitionFiles, findPatterns } from "./sources/usage.js"
import { type StarterRule, starterRules } from "./starter-rules.js"
import { loadCompiled } from "./store.js"
import { CLI_NAME, CLI_VERSION, NPM_PACKAGE } from "./version.js"
import { runInBrowser } from "./web/run.js"
import { installStepsFor, WORKFLOW_PATH, workflowYaml } from "./workflow.js"

const TOP = 5
const CLIENT_DIRS: Array<[string, string]> = [
  [".claude", "claude-code"],
  [".cursor", "cursor"],
  [".codex", "codex"],
  [".windsurf", "windsurf"]
]

interface Ran {
  code: number
  out: string
  err: string
}

/** The person setting this up: --as, INVARIANT_USER, else git's user.name. Recorded, not authenticated. */
function whoIs(c: Context): string | undefined {
  const given = c.args.values.as ?? c.io.env?.INVARIANT_USER
  if (given && given.trim() !== "") return given.trim()
  try {
    const name = execFileSync("git", ["config", "user.name"], {
      cwd: c.cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim()
    return name === "" ? undefined : name
  } catch {
    return undefined
  }
}

/** A command a person can run without installing anything. `invariant <command>` works only once the CLI is installed. */
const npx = (args: string): string => `npx ${NPM_PACKAGE}@${CLI_VERSION} ${args}`

const slugId = (name: string, category = "composition"): string =>
  `${category}.${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)}`.replace(/\.$/, ".pattern")

/** Folders under node_modules that ship a compiled contract (`<package>/invariant/invariant.contract.json`). */
function shippedContracts(cwd: string): string[] {
  const modules = path.join(cwd, "node_modules")
  if (!existsSync(modules)) return []
  const found: string[] = []
  const check = (rel: string): void => {
    if (existsSync(path.join(cwd, rel, "invariant", "invariant.contract.json")))
      found.push(`${rel}/invariant`)
  }
  for (const name of readdirSync(modules).sort()) {
    if (name.startsWith(".")) continue
    if (name.startsWith("@")) {
      for (const inner of readdirSync(path.join(modules, name)).sort()) check(`node_modules/${name}/${inner}`)
    } else check(`node_modules/${name}`)
  }
  return found
}

/**
 * `invariant setup`: compile, look at the app code, then show one plan and ask once. Yes confirms the contract and does
 * everything in the plan; n stops; c asks about each step. Approval only ever follows a confirmed contract.
 */
export async function setup(c: Context): Promise<number> {
  const started = Date.now()
  // Every line sits in the clack frame: say is a detail line, step a completed one, flag a warning.
  const fit = (m: string): string[] => m.split("\n").flatMap((l) => wrap(l, columns() - 3))
  const say = (m = ""): void => {
    for (const l of m.split("\n")) if (l !== "") c.io.report?.({ kind: "say", text: l })
    for (const l of fit(m)) print(c, l === "" ? gap() : line(l))
  }
  const step = (m: string): void => {
    c.io.report?.({ kind: "step", text: m })
    const [first = "", ...rest] = fit(m)
    print(c, done(first))
    for (const l of rest) print(c, line(l))
  }
  const flag = (m: string): void => {
    c.io.report?.({ kind: "flag", text: m })
    const [first = "", ...rest] = fit(m)
    print(c, warn(first))
    for (const l of rest) print(c, line(l))
  }
  const busy = <T>(label: string | (() => string), work: () => Promise<T>): Promise<T> => {
    const report = c.io.report
    if (!report) return spin((t) => c.io.stdout(t), label, work)
    // The browser shows the same live label the terminal spinner does.
    const tick = (): void => report({ kind: "busy", text: typeof label === "function" ? label() : label })
    tick()
    const timer = setInterval(tick, 400)
    return spin((t) => c.io.stdout(t), label, work).finally(() => {
      clearInterval(timer)
      report({ kind: "busy", text: null })
    })
  }
  const phase = (id: string, title: string): void => c.io.phase?.(id, title)
  const num = (n: number): string => n.toLocaleString("en-US")
  const yes = c.args.values.yes === true
  const carry = [
    ...(c.args.values.config ? ["--config", c.args.values.config] : []),
    ...(c.args.values.dir ? ["--dir", c.args.values.dir] : []),
    ...(c.args.values["trust-config"] ? ["--trust-config"] : [])
  ]
  const sub = async (...argv: string[]): Promise<Ran> => {
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
  /** true or false when someone answered or --yes decided; undefined when there is no one to ask. */
  const ask = async (question: string, byDefault: boolean): Promise<boolean | undefined> => {
    if (!c.io.prompt) return undefined
    const a = (await c.io.prompt(`${paint("accent", "◆")}  ${question} ${byDefault ? "[Y/n]" : "[y/N]"} `))
      ?.trim()
      .toLowerCase()
    if (a === undefined || a === "") return byDefault
    return a.startsWith("y")
  }

  const yesish = yes || c.args.values["confirm-contract"] === true
  const listOf = (v: string | undefined): string[] =>
    (v ?? "")
      .split(",")
      .map((p) => p.trim().replace(/^\.\//, "").replace(/\/+$/, ""))
      .filter(Boolean)
  const includes = listOf(c.args.values.include ?? c.args.values.sources)
  const excludes = listOf(c.args.values.exclude)

  /** Why the last discovery was not sure, for the message when there is no one to ask. */
  let unsure: string[] = []
  /** What the person confirmed, to compare with what the compile produced. */
  /** What the component review looked at, so the pattern review need not read the project again. */
  let projectInfo: { scan: Scan; packages: string[] } | undefined
  let confirmedSet:
    | { components: number; packages: Array<{ name: string; dir: string; entries: number }> }
    | undefined
  const needsConfirmation = (): string =>
    `The component directories need your confirmation${unsure.length > 0 ? ` (${unsure.join("; ")})` : ""}, and there is no terminal to ask. ${
      yesish
        ? "Nothing was recommended, so --yes had nothing to accept. Name the directories with --include <paths>"
        : "Re-run with --yes to accept the recommended directories, or name them with --include <paths>"
    } (and --exclude <paths> to reject some). If you do not know where they are, an AI agent can find them: ask it to follow the invariant-setup skill from the Invariant plugin (the one that finds where components live, not the guided setup), then pass what it found to --include.`

  /**
   * Recognizes the project, discovers the directories that hold components, and has the person confirm them (or takes
   * `--include`, `--exclude` and `--yes`). Nothing recommended counts as approved until it is confirmed.
   */
  const confirmComponentSources = async (
    base: InvariantConfig,
    prior: ComponentSource[],
    options: { allowEverything: boolean }
  ): Promise<
    { config: InvariantConfig } | "stopped" | "needs-confirmation" | "nothing-found" | "everything"
  > => {
    phase("scan", "Scan")
    let walked = { files: 0, directories: 0 }
    const analysis = await busy(
      () => `scanning every folder: ${num(walked.files)} files so far`,
      () =>
        analyzeProject(c.cwd, base, (p) => {
          walked = p
        })
    )
    const { recognition, thresholds } = analysis
    projectInfo = { scan: analysis.scan, packages: recognition.project.packages.map((p) => p.dir) }
    step(
      `scanned ${num(analysis.scan.files.length)} files in ${num(analysis.scan.directories)} folders (dependencies, build output and .gitignore entries are skipped)`
    )
    const kinds: Record<string, string> = {
      "component-library": "a UI component library",
      application: "an application",
      monorepo: "a monorepo",
      unknown: "a project with no recognizable UI package"
    }
    step(`identified this project as ${kinds[recognition.kind]}`)
    const shown = recognition.packages.filter((p) => p.role !== "utility")
    const SHOW = 8
    for (const r of shown.slice(0, SHOW)) {
      say(
        `${r.name ?? r.dir}  ${r.dir}  ${r.role}${r.frameworks.length > 0 ? `  ${r.frameworks.join(", ")}` : ""}${r.role === "design-system" ? `  (${r.confidence} confidence)` : ""}`
      )
      if (r.role === "design-system" && shown.length <= 3)
        for (const e of r.evidence.filter((x) => x.weight > 0).slice(0, 3)) say(`  + ${e.detail}`)
    }
    if (shown.length > SHOW) say(`+${shown.length - SHOW} more packages (see --discover-only for all)`)
    if (shown.length > 0) say()
    // Look in every candidate package first, then keep the ones that hold components: a hooks or utility package
    // that looks like a library is not worth asking about.
    const all = await busy("looking for component directories", () => discoverFor(c.cwd, analysis))
    let targets = analysis.targets.filter((t) => all.candidates.some((x) => x.packageDir === t.dir))
    let found = all
    // Asked only about packages recognized as design systems: when setup fell back to applications, the list below says more.
    if (
      targets.length > 1 &&
      targets.every((t) => t.role === "design-system") &&
      !yesish &&
      includes.length === 0 &&
      c.io.multiselect
    ) {
      const picked = await c.io.multiselect(
        "Which packages belong to the design system?",
        targets.map((t, i) => ({
          value: String(i),
          label: `${t.name ?? t.dir}  (${t.dir}, ${all.candidates.filter((x) => x.packageDir === t.dir).reduce((n, x) => n + x.componentCount, 0)} components)`
        }))
      )
      targets = targets.filter((_, i) => picked?.includes(String(i)))
      found = {
        ...all,
        candidates: all.candidates.filter((x) => targets.some((t) => t.dir === x.packageDir))
      }
    }
    for (const d of found.diagnostics) flag(d)
    const addPath = async (raw: string): Promise<Added | string> => {
      const rel = inside(c.cwd, raw)
      if (!rel) return `${raw} is outside the project`
      const full = path.join(c.cwd, rel)
      if (!existsSync(full)) return `${raw} does not exist`
      const type = statSync(full).isDirectory() ? "directory" : "file"
      if (type === "file" && !/\.(tsx|jsx|vue|ts|js)$/i.test(rel))
        return `${raw} is not a component file (.tsx, .jsx, .vue or .ts)`
      const r = await analyzePath(c.cwd, recognition, rel, thresholds, analysis.scan)
      return r
        ? { candidate: r.candidate, type }
        : `no components found in ${raw} (looked for React, Vue and Angular components)`
    }
    phase("components", "Components")
    const assessment = assess({ candidates: found.candidates, recognition, thresholds })
    const canAsk = c.io.prompt !== undefined && !yesish && includes.length === 0 && excludes.length === 0
    // Looked for once, and only when someone can answer: an agent is never started on its own.
    const agents = canAsk ? detectAgents(c.io.env ?? {}) : []
    let candidates = found.candidates

    /** One of the choices, with arrows when there is a terminal and typed numbers when there is not. */
    const pick = async <T extends string>(
      question: string,
      choices: ReadonlyArray<Choice<T>>
    ): Promise<T | undefined> => {
      if (c.io.select) return c.io.select(question, choices)
      for (const [i, ch] of choices.entries()) say(`${i + 1}. ${ch.label}`)
      for (let tries = 0; tries < 3; tries++) {
        const a = (await c.io.prompt?.(`${paint("accent", "◆")}  ${question} [1-${choices.length}] `))?.trim()
        if (a === undefined) return undefined
        const n = Number(a)
        const hit =
          Number.isInteger(n) && n >= 1 && n <= choices.length
            ? choices[n - 1]
            : choices.find((ch) => ch.key === a.toLowerCase())
        if (hit) return hit.value
        flag(`${a === "" ? "nothing" : a} is not one of the choices`)
      }
      return undefined
    }

    /**
     * Asks an AI agent where the components are, then checks what it says: every directory must exist and hold components
     * setup can find itself. The agent's confidence and reason are kept with the directory. Nothing is approved here.
     */
    const askAgent = async (
      agent: Agent,
      base: DirectoryCandidate[]
    ): Promise<DirectoryCandidate[] | "stopped" | undefined> => {
      const prompt = scanPrompt(
        scanSummary({
          files: analysis.scan.files.length,
          directories: analysis.scan.directories,
          packages: recognition.packages,
          candidates: base,
          reasons: assessment.reasons
        })
      )
      const started = Date.now()
      const ran = await busy(
        () =>
          `${agent.name} is looking through the project (${Math.round((Date.now() - started) / 1000)}s). This can take a few minutes. Ctrl+C stops.`,
        () =>
          runAgent(agent, prompt, {
            cwd: c.cwd,
            ...(c.io.env ? { env: c.io.env } : {}),
            ...(c.io.signal ? { signal: c.io.signal } : {})
          })
      )
      if (c.io.signal?.aborted) return "stopped"
      if (!ran.ok) {
        flag(`${agent.name}: ${ran.reason}`)
        return undefined
      }
      const findings = parseFindings(ran.text)
      if (!findings.ok) {
        flag(`${agent.name} answered, but setup cannot use the answer: ${findings.reason}`)
        return undefined
      }
      const next = [...base]
      let confirmed = 0
      for (const s of findings.directories) {
        const r = await addPath(s.path)
        if (typeof r === "string") flag(`${agent.name} named ${s.path}: ${r}`)
        else if (r.type !== "directory")
          flag(`${agent.name} named ${s.path}, which is a file; only directories are taken`)
        else {
          const at = next.findIndex((x) => x.path === r.candidate.path)
          const known = at >= 0 ? (next[at] as DirectoryCandidate) : undefined
          // The scan keeps the credit only for a directory it recommended itself; a low-scoring one the agent vouched for is the agent's.
          const marked = withSuggestion(
            known ?? r.candidate,
            agent.name,
            s,
            known?.recommendation === "recommended"
          )
          if (at >= 0) next[at] = marked
          else next.push(marked)
          confirmed++
          say(
            `${s.path}  ${marked.componentCount} component${marked.componentCount === 1 ? "" : "s"}  (${s.confidence}) ${s.reason}`
          )
        }
      }
      for (const p of findings.rejected)
        flag(`${agent.name} named ${p}, which is not a path inside the project`)
      if (findings.notes) say(`${agent.name} noted: ${findings.notes}`)
      say()
      step(
        `${agent.name} named ${findings.directories.length} director${findings.directories.length === 1 ? "y" : "ies"}; ${confirmed} hold${confirmed === 1 ? "s" : ""} components setup can find`
      )
      return confirmed === 0 ? undefined : next
    }

    /** Asks one of the agents found, from the review. With several, the person says which. */
    const askAny = async (current: DirectoryCandidate[]): ReturnType<typeof askAgent> => {
      const id =
        agents.length === 1
          ? agents[0]?.id
          : await pick<AgentId>(
              "Which agent?",
              agents.map((a, i) => ({ value: a.id, label: a.name, key: String(i + 1) }))
            )
      const agent = agents.find((a) => a.id === id)
      return agent ? askAgent(agent, current) : undefined
    }

    /** The scan is not sure, and someone can answer: offer the agents found on this machine, or let them choose themselves. */
    const whenUnsure = async (): Promise<"stopped" | "everything" | "review"> => {
      flag(`not confident about the component directories: ${assessment.reasons.join("; ")}`)
      say()
      if (agents.length === 0 && candidates.length > 0) {
        say(
          "No AI agent to ask was found on this machine (looked for claude, codex and cursor-agent). Review what the scan found, or add directories yourself."
        )
        return "review"
      }
      if (agents.length > 0)
        say(
          `An AI agent can look through the project and point at the directories: found ${agents.map((a) => a.name).join(", ")}. It can only read files (it cannot edit them or run commands), and what it reads is sent to its provider, under your account. Setup checks what it says, and nothing is approved until you confirm it.`
        )
      say()
      for (;;) {
        type Choose = AgentId | "review" | "everything" | "stop"
        const picked = await pick<Choose>("How do you want to go on?", [
          ...agents.map((a, i) => ({
            value: a.id as Choose,
            label: `Ask ${a.name} to find them (it only reads files)`,
            key: String(i + 1)
          })),
          {
            value: "review" as Choose,
            label:
              candidates.length > 0
                ? "Choose from what the scan found, or add directories myself"
                : "Enter the directories myself",
            key: "d"
          },
          ...(options.allowEverything
            ? [
                {
                  value: "everything" as Choose,
                  label: "Compile everything the packages export, with no list of components",
                  key: "e"
                }
              ]
            : []),
          { value: "stop" as Choose, label: "Stop", key: "n" }
        ])
        if (picked === undefined || picked === "stop") return "stopped"
        if (picked === "review" || picked === "everything") return picked
        const agent = agents.find((a) => a.id === picked) as Agent
        const got = await askAgent(agent, candidates)
        if (got === "stopped") return "stopped"
        if (got) {
          candidates = got
          return "review"
        }
      }
    }

    if (assessment.level === "low" && canAsk) {
      const next = await whenUnsure()
      if (next === "stopped") return "stopped"
      if (next === "everything") return "everything"
    } else if (
      assessment.level === "low" &&
      candidates.length === 0 &&
      includes.length === 0 &&
      !yesish &&
      recognition.packages.some((p) => p.frameworks.length > 0)
    ) {
      // Components should be here and the scan found none. With no one to ask, going on would mean guessing.
      unsure = assessment.reasons
      return "needs-confirmation"
    }
    if (candidates.length === 0 && includes.length === 0 && !canAsk) return "nothing-found"
    say()
    step(
      `found ${new Set(candidates.flatMap((x) => x.components.map((k) => `${k.file}#${k.name}`))).size} components in ${candidates.length} director${candidates.length === 1 ? "y" : "ies"}`
    )
    let result: ReviewResult | undefined
    if (canAsk)
      result = await reviewSources(
        c.io,
        { say, flag },
        {
          candidates,
          prior,
          addPath,
          ...(agents.length > 0
            ? {
                askAgent: {
                  label: `Ask ${agents.map((a) => a.name).join(" or ")} to help find them (it only reads files; what it reads is sent to its provider)`,
                  run: askAny
                }
              }
            : {})
        }
      )
    else {
      const include: Added[] = []
      for (const p of includes) {
        const r = await addPath(p)
        if (typeof r === "string") throw new CliError(`--include: ${r}`)
        include.push(r)
      }
      const exclude = excludes.map((e) => ({
        path: e,
        type:
          existsSync(path.join(c.cwd, e)) && statSync(path.join(c.cwd, e)).isFile()
            ? ("file" as const)
            : ("directory" as const)
      }))
      result = decideWithoutAsking({ candidates, prior, yes: yesish, include, exclude })
      if (!result.decisions.some((d) => d.status === "approved")) {
        unsure = assessment.level === "low" ? assessment.reasons : []
        return "needs-confirmation"
      }
    }
    if (!result) return "stopped"
    // Counted by file, because that is what the decisions say: a directory can be approved with some of its files out.
    const distinct = new Set(
      result.candidates.flatMap((x) =>
        x.components.filter((k) => inScope(k.file, result.decisions)).map((k) => `${k.file}#${k.name}`)
      )
    )
    const places = result.decisions.filter((d) => d.status === "approved").length
    step(`${distinct.size} components selected across ${places} path${places === 1 ? "" : "s"}`)
    const owners = new Map<string, { name: string; dir: string; entries: number }>()
    for (const d of result.decisions.filter((x) => x.status === "approved")) {
      const owner = [...recognition.project.packages]
        .filter((p) => p.dir === "." || d.path === p.dir || d.path.startsWith(`${p.dir}/`))
        .sort((a, b) => b.dir.length - a.dir.length)[0]
      if (owner)
        owners.set(owner.dir, {
          name: owner.name ?? owner.dir,
          dir: owner.dir,
          entries: owner.entryPoints.length
        })
    }
    confirmedSet = { components: distinct.size, packages: [...owners.values()] }
    return {
      config: applyDecisions(base, {
        decisions: result.decisions,
        recognition,
        candidates: result.candidates,
        packages: targets
      })
    }
  }

  const posture = c.args.values.posture
  if (posture !== undefined && !(POSTURES as readonly string[]).includes(posture))
    throw new CliError(`--posture must be one of ${POSTURES.join(", ")}`)
  const only = c.args.values.only?.trim().toLowerCase()
  if (only !== undefined && only !== "none" && !/^\d+(\s*,\s*\d+)*$/.test(only))
    throw new CliError("--only takes the numbers of the patterns to add (like 1,3), or none")

  if (c.args.values["discover-only"]) {
    const analysis = await analyzeProject(c.cwd)
    const found = await discoverFor(c.cwd, analysis)
    const { project: _project, ...recognition } = analysis.recognition
    json(c, {
      recognition,
      scanned: { files: analysis.scan.files.length, directories: analysis.scan.directories },
      // How sure the scan is. When it is low, the invariant-setup skill is the way to look further.
      confidence: assess({
        candidates: found.candidates,
        recognition: analysis.recognition,
        thresholds: analysis.thresholds
      }),
      candidates: found.candidates,
      diagnostics: found.diagnostics
    })
    return 0
  }

  // The browser version comes first: a person at a terminal is asked where to set up, unless a flag already says.
  const browserOk =
    c.io.select !== undefined &&
    c.io.prompt !== undefined &&
    !yesish &&
    includes.length === 0 &&
    excludes.length === 0 &&
    only === undefined &&
    c.args.values.terminal !== true
  if (browserOk && c.io.select && c.args.values.web !== true) {
    const where = await c.io.select<"web" | "terminal">("Where do you want to set up?", [
      {
        value: "web",
        label: "In your browser (recommended): a local page that only this computer can open",
        key: "w"
      },
      { value: "terminal", label: "In this terminal", key: "t" }
    ])
    if (where === undefined) return 0
    if (where === "web") return runInBrowser(c, setup)
  } else if (c.args.values.web === true) {
    if (!browserOk)
      throw new CliError(
        "--web needs a terminal to start from, and cannot be combined with --yes, --include, --exclude or --only"
      )
    return runInBrowser(c, setup)
  }

  print(c, intro(`${CLI_NAME} setup`))
  say()

  // 1. Detect and compile. A project with no design-system sources of its own uses the contract its library ships.
  const configPath = path.resolve(c.cwd, c.args.values.config ?? CONFIG_FILE)
  let consumer = false
  if (!existsSync(configPath)) {
    const detected = c.args.values.contract ? undefined : await detectConfig(c.cwd)
    if (detected && (detected.sources.length > 0 || includes.length > 0)) {
      const r = await confirmComponentSources(detected, [], { allowEverything: true })
      if (r === "stopped") {
        say("Stopped. Nothing was written.")
        print(c, outro("stopped", true))
        return 0
      }
      if (r === "needs-confirmation") {
        say(`${needsConfirmation()} Nothing was written.`)
        print(c, outro("not confirmed", true))
        return 0
      }
      if (r === "nothing-found") {
        flag("no components found by reading the source, so the detected sources are used as they are")
        writeConfig(configPath, detected)
      } else if (r === "everything") {
        step("compiling everything the detected sources export, as you chose")
        // An empty list records the choice, so a later run does not ask again.
        writeConfig(configPath, { ...detected, componentSources: [] })
      } else writeConfig(configPath, r.config)
      step(`wrote ${path.basename(configPath)}`)
    } else {
      consumer = true
      let from = c.args.values.contract?.replace(/\\/g, "/").replace(/\/+$/, "")
      if (!from) {
        const found = shippedContracts(c.cwd)
        if (found.length === 0)
          throw new CliError(
            "no design system source found here, and no installed package ships a contract (no node_modules/<package>/invariant/). Install your design system package, pass --contract <folder>, or run setup in the design system's own repository."
          )
        if (found.length === 1) from = found[0]
        else {
          const list = found.map((f, i) => `${i + 1}. ${f}`).join("\n")
          const pick = c.io.prompt
            ? Number(
                (await c.io.prompt(
                  `${paint("accent", "◆")}  Several contracts are installed:\n${list}\n${paint("accent", "◆")}  Which one? [1-${found.length}] `
                )) ?? ""
              )
            : Number.NaN
          if (!Number.isInteger(pick) || pick < 1 || pick > found.length)
            throw new CliError(
              `several installed packages ship a contract, so say which: --contract <folder>\n${list}`
            )
          from = found[pick - 1]
        }
      }
      if (!from) throw new CliError("--contract needs a folder")
      const base = loadCompiled(path.resolve(c.cwd, from))
      const config: InvariantConfig = {
        name: base.contract.metadata.name,
        sources: [],
        extends: { contract: from }
      }
      writeConfig(configPath, config)
      step(
        `no design system source here. Using the contract shipped in ${from} (${base.contract.metadata.name}, ${base.contract.components.length} components) and wrote ${path.basename(configPath)}`
      )
    }
  } else {
    const loaded = await loadConfig({
      cwd: c.cwd,
      file: c.args.values.config,
      trustConfig: c.args.values["trust-config"] === true
    })
    const existing = loaded?.config
    consumer = existing?.extends !== undefined
    const approved = (existing?.componentSources ?? []).filter((x) => x.status === "approved").length
    step(
      `using ${path.basename(configPath)}${consumer ? ` (extends ${existing?.extends?.contract})` : ""}${approved > 0 ? `, ${approved} approved component source(s) (--rediscover reviews them again)` : ""}`
    )
    // A configuration whose components nobody confirmed (written by an older setup, or by hand) is reviewed like a first
    // run: setup does not go on until a person has said where the components are. `componentSources: []` records that
    // they chose to compile everything the packages export.
    const confirmedBefore = hasApproved(existing) || existing?.componentSources?.length === 0
    const hasUiSource = existing?.sources.some((s) => ["react", "vue", "angular"].includes(s.type)) === true
    if (existing && !consumer && (c.args.values.rediscover === true || (!confirmedBefore && hasUiSource))) {
      if (!loaded?.editable)
        flag(
          `${path.basename(configPath)} is code, so setup cannot save the component directories in it. Set componentSources there, or use ${CONFIG_FILE}.`
        )
      else {
        const prior = priorDecisions(existing)
        const r = await confirmComponentSources(existing, prior, { allowEverything: prior.length === 0 })
        if (r === "stopped" || r === "needs-confirmation") {
          say(
            r === "stopped"
              ? "Stopped. The configuration was not changed."
              : `${needsConfirmation()} The configuration was not changed.`
          )
          print(c, outro(r === "stopped" ? "stopped" : "not confirmed", true))
          return 0
        }
        if (r === "everything") {
          step("compiling everything the configured sources export, as you chose")
          writeConfig(configPath, { ...existing, componentSources: [] })
        } else if (r !== "nothing-found") writeConfig(configPath, r.config)
      }
    }
  }
  const compiled = await busy("compiling", () => sub("compile"))
  const dir = await outputDir(c)
  if (!existsSync(path.join(dir, "invariant.contract.json")))
    throw new CliError(`compile did not produce a contract.\n${(compiled.err || compiled.out).trim()}`, 1)
  const { contract } = loadCompiled(dir)
  const names = contract.components.map((x) => x.name)
  step(
    `${consumer ? "compiled with your own patterns on top" : "compiled"}: ${contract.components.length} components${names.length > 0 ? ` (${names.slice(0, 6).join(", ")}${names.length > 6 ? `, +${names.length - 6} more` : ""})` : ""}, ${contract.tokens.length} tokens, ${contract.conflicts.length} conflicts`
  )
  if (compiled.code === 1) flag("compile reported errors; see invariant/invariant.diagnostics.json")
  // Setup finds components by reading the code, but the compile reads the ones a package exports from its entry points.
  // When most of what the person confirmed did not reach the contract, say so and say why, instead of reporting a count.
  if (confirmedSet && contract.components.length * 2 < confirmedSet.components) {
    const without = confirmedSet.packages.filter((p) => p.entries === 0).map((p) => p.name)
    let lost = false
    let shown: string[] = []
    try {
      const found = (
        JSON.parse(readFileSync(path.join(dir, "invariant.diagnostics.json"), "utf8")) as {
          diagnostics?: Array<{ severity: string; code: string; message: string }>
        }
      ).diagnostics
      const first = ["cli.source-matched-nothing", "discovery.walk-truncated"]
      const all = (found ?? []).filter((d) => d.severity !== "error" && !d.code.startsWith("tokens."))
      lost = all.some((d) => first.includes(d.code))
      shown = [
        ...new Set(
          [...all]
            .sort((a, b) => Number(first.includes(b.code)) - Number(first.includes(a.code)))
            .map((d) => `${d.code}: ${d.message}`)
        )
      ]
    } catch {
      // The diagnostics file is a convenience here.
    }
    if (lost)
      flag(
        `only ${contract.components.length} of the ${confirmedSet.components} components you confirmed are in the contract, because the compile did not find the sources setup configured for them.`
      )
    else
      flag(
        `only ${contract.components.length} of the ${confirmedSet.components} components you confirmed are in the contract. The compile reads the components a package exports from its entry points, and components no entry point exports are left out. ${
          without.length > 0
            ? `No entry point was found for ${without.slice(0, 6).join(", ")}${without.length > 6 ? `, +${without.length - 6} more` : ""} (looked for package.json main or exports, an ng-package.json entryFile, src/public-api.ts and src/index.ts).`
            : "Every confirmed package has an entry point, so they do not export the other components."
        }`
      )
    for (const w of shown.slice(0, 4)) say(`  ${w.slice(0, 220)}`)
    say("The rest of the diagnostics are in invariant/invariant.diagnostics.json.")
  }

  // 2. Gather everything the plan needs. Nothing here changes the project except the compile output and the candidates file.
  const by = whoIs(c)
  const config = (
    await loadConfig({
      cwd: c.cwd,
      file: c.args.values.config,
      trustConfig: c.args.values["trust-config"] === true
    })
  )?.config
  const sourcePaths = (config?.sources ?? [])
    .map((s) => ("path" in s && typeof s.path === "string" ? s.path.replace(/^\.\//, "") : ""))
    .filter((p) => p !== "" && p !== ".")
  phase("patterns", "Patterns")
  // Patterns come from how the confirmed components are used, wherever that is: every file in the project that can use
  // one is looked at, not only application folders.
  type Cand = CandidatesFile["candidates"][number]
  const explicitPaths = (c.args.values.paths ?? "")
    .split(",")
    .map((p) => p.trim().replace(/^\.\//, ""))
    .filter(Boolean)
  const info =
    projectInfo ??
    (await busy("scanning every folder", async () => {
      const a = await analyzeProject(c.cwd, config)
      return { scan: a.scan, packages: a.recognition.project.packages.map((p) => p.dir) }
    }))
  const compiledNow = loadCompiled(dir)
  const reviewsFile = path.resolve(c.cwd, config?.governance?.candidateReviewsFile ?? REVIEWS_FILE)
  let priorReviews: ReviewsFile | undefined
  if (existsSync(reviewsFile)) {
    const parsedReviews = parseReviews(readFileSync(reviewsFile, "utf8"), path.basename(reviewsFile))
    if (parsedReviews.ok) priorReviews = parsedReviews.value
  }
  const definitions = definitionFiles(compiledNow.contract, sourcePaths)
  let readSoFar = 0
  const usage = await busy(
    () => `looking for how your components are used: ${num(readSoFar)} files read`,
    () =>
      findPatterns({
        scan: info.scan,
        compiled: compiledNow,
        within: explicitPaths,
        exclude: definitions,
        reviews: priorReviews,
        onProgress: (n) => {
          readSoFar = n
        }
      })
  )
  const writable = await writableDir(c)
  mkdirSync(writable, { recursive: true })
  writeFileSync(path.join(writable, CANDIDATES_FILE), `${JSON.stringify(usage.candidates, null, 2)}\n`)
  // Where the usage is: the package that holds it, else its top folder. Where the components are defined does not count.
  const holdsDefinitions = (d: string): boolean => [...definitions].some((f) => f.startsWith(`${d}/`))
  const usageDirs = [
    ...new Set(
      usage.usageFiles.map((f) => {
        const owner = info.packages
          .filter((d) => d !== "." && f.startsWith(`${d}/`))
          .sort((x, y) => y.length - x.length)[0]
        return owner ?? f.split("/")[0] ?? "."
      })
    )
  ].sort()
  const consumers = usageDirs.filter((d) => !holdsDefinitions(d))
  const appPaths = explicitPaths.length > 0 ? explicitPaths : consumers.length > 0 ? consumers : usageDirs
  const total = info.scan.files.length
  step(
    `${num(usage.usageFiles.length)} of ${num(usage.filesRead)} template and component files use your components (${num(total)} files in the project)`
  )
  if (appPaths.length > 0)
    say(
      `used in: ${appPaths.slice(0, 8).join(", ")}${appPaths.length > 8 ? `, +${appPaths.length - 8} more` : ""}`
    )
  for (const d of usage.candidates.diagnostics.filter((x) => x.severity === "warning")) flag(d.message)

  const all = usage.candidates.candidates
    .filter((x) => x.status === "proposed" && x.subsumedBy === undefined)
    .sort(
      (a, b) =>
        Number(b.archetype !== undefined) - Number(a.archetype !== undefined) ||
        b.support.files - a.support.files ||
        (a.id < b.id ? -1 : 1)
    )
  // The strongest start ticked: pages and layouts first, then the most repeated.
  let top: Cand[] = all.slice(0, TOP)
  if (all.length === 0)
    step("no structure recurs often enough to propose (a pattern needs to appear in 3 files)")
  else step(`found ${all.length} recurring structure${all.length === 1 ? "" : "s"}`)
  const decidedBefore = priorReviews?.reviews.length ?? 0
  if (decidedBefore > 0)
    say(
      `${decidedBefore} structure${decidedBefore === 1 ? "" : "s"} you decided on earlier ${decidedBefore === 1 ? "is" : "are"} not listed again (kept in ${path.basename(reviewsFile)}).`
    )

  // Tick the ones that should guide AI tools, then rename or recategorize. Asked only when someone can answer.
  const directed = new Map<string, { name?: string; category?: string }>()
  const denied: Cand[] = []
  const describe = (x: Cand): string =>
    `${x.suggestedName}  ${x.support.files} files · ${x.support.occurrences} uses${x.archetype ? ` · looks like a ${x.archetype.category}: ${x.archetype.reason}` : ""}`
  if (
    all.length > 0 &&
    !yes &&
    only === undefined &&
    c.args.values["confirm-contract"] !== true &&
    c.io.prompt
  ) {
    say()
    const ticked = new Set(top.map((x) => x.id))
    const groups = [
      { label: "Pages", items: all.filter((x) => x.archetype?.category === "page") },
      { label: "Layouts", items: all.filter((x) => x.archetype?.category === "layout") },
      { label: "Other recurring structures", items: all.filter((x) => x.archetype === undefined) }
    ]
      .filter((g) => g.items.length > 0)
      .map((g) => ({
        label: g.label,
        collapsed: all.length > 200,
        items: g.items.map((x) => ({ value: x.id, label: describe(x), ticked: ticked.has(x.id) }))
      }))
    let chosen: string[] | undefined
    if (c.io.tree) chosen = await c.io.tree("Which patterns should guide AI tools?", groups)
    else {
      say("Which patterns should guide AI tools? They are proposals until you approve them.")
      const numbered = groups.flatMap((g) => g.items)
      for (const [i, it] of numbered.entries()) say(`${i + 1}. [${it.ticked ? "x" : " "}] ${it.label}`)
      const a = (
        (await c.io.prompt(
          `${paint("accent", "◆")}  Enter keeps the [x] ones, a ticks all, n clears, numbers or ranges (like 2,5-9) toggle: `
        )) ?? ""
      )
        .trim()
        .toLowerCase()
      const on = new Set(ticked)
      for (const t of a.split(/[,\s]+/).filter(Boolean)) {
        const range = /^(\d+)(?:-(\d+))?$/.exec(t)
        if (t === "a" || t === "all") for (const it of numbered) on.add(it.value)
        else if (t === "n" || t === "none") on.clear()
        else if (range)
          for (let i = Number(range[1]); i <= Number(range[2] ?? range[1]); i++) {
            const it = numbered[i - 1]
            if (it !== undefined && !on.delete(it.value)) on.add(it.value)
          }
      }
      chosen = [...on]
    }
    top = all.filter((x) => chosen?.includes(x.id))
    for (;;) {
      if (top.length === 0) break
      const a = (
        (await c.io.prompt(
          `${paint("accent", "◆")}  Rename one or change its category? Its number from the list below, or Enter to go on:\n${top.map((x, i) => `${paint("muted", "│")}  ${i + 1}. ${x.suggestedName}`).join("\n")}\n${paint("accent", "◆")}  Number: `
        )) ?? ""
      ).trim()
      const x = top[Number(a) - 1]
      if (!x) break
      const name = ((await c.io.prompt(`${paint("accent", "◆")}  Name [${x.suggestedName}]: `)) ?? "").trim()
      const cat = (
        (await c.io.prompt(
          `${paint("accent", "◆")}  Category (${PATTERN_CATEGORIES.join(", ")}) [${x.archetype?.category ?? "composition"}]: `
        )) ?? ""
      )
        .trim()
        .toLowerCase()
      if (cat !== "" && !(PATTERN_CATEGORIES as readonly string[]).includes(cat))
        flag(`${cat} is not a category, so it keeps ${x.archetype?.category ?? "composition"}`)
      directed.set(x.id, {
        ...(name !== "" ? { name } : {}),
        ...(cat !== "" && (PATTERN_CATEGORIES as readonly string[]).includes(cat) ? { category: cat } : {})
      })
    }
  } else if (top.length > 0) {
    // Nobody to ask: the strongest are proposed, numbered so --only can pick among them.
    for (const [i, x] of top.entries()) say(`${i + 1}. ${describe(x)}`)
  }
  const categoryOf = (x: Cand): string =>
    directed.get(x.id)?.category ?? x.archetype?.category ?? "composition"
  const rulesFor = (x: Cand): StarterRule[] => starterRules(x.structure.tree)
  const countViolations = async (): Promise<number> => {
    if (appPaths.length === 0) return 0
    const r = await sub("validate", ...appPaths, "--format", "json", "--no-baseline")
    try {
      return (JSON.parse(r.out) as { violations: unknown[] }).violations.length
    } catch {
      return 0
    }
  }
  const baselineWanted = appPaths.length > 0 && !existsSync(path.join(c.cwd, BASELINE_FILE))
  const existingViolations =
    baselineWanted && c.args.values["no-baseline"] !== true ? await countViolations() : 0
  const clients =
    c.args.values["no-agent"] === true
      ? []
      : CLIENT_DIRS.filter(([d]) => existsSync(path.join(c.cwd, d))).map(([, n]) => n)
  const workflowFile = path.join(c.cwd, WORKFLOW_PATH)
  const wantsCi = c.args.values.ci === true
  const ciPossible =
    c.args.values["no-ci"] !== true &&
    !existsSync(workflowFile) &&
    (wantsCi || existsSync(path.join(c.cwd, ".git")) || existsSync(path.join(c.cwd, ".github")))
  if (existsSync(workflowFile) && c.args.values["no-ci"] !== true)
    say(`${WORKFLOW_PATH} already exists, so it will be left alone.`)
  const publishFinding =
    consumer || c.args.values["no-publish"] === true || !config
      ? undefined
      : planPublish(c.cwd, config, path.relative(c.cwd, dir) || "invariant")
  const publish = publishFinding?.ok ? publishFinding.plan : undefined
  const publishNeeded = publish !== undefined && !(publish.hasFiles && publish.hasPrepack)
  if (publishFinding && !publishFinding.ok) flag(`not wiring publishing: ${publishFinding.reason}`)

  // 3. One plan, one question.
  phase("plan", "Plan")
  const noRules = c.args.values["no-rules"] === true
  const ruleCount = noRules ? 0 : top.reduce((n, x) => n + rulesFor(x).length, 0)
  const planLines = (approving: boolean): string[] => [
    ...(top.length > 0
      ? [
          approving
            ? `add ${top.length} recurring pattern(s) from ${appPaths.join(", ")}, approved by ${by ?? "you"}`
            : `add ${top.length} recurring pattern(s) from ${appPaths.join(", ")} as proposals (not approved)`
        ]
      : []),
    ...(approving && ruleCount > 0
      ? [
          `turn on ${ruleCount} starter rule(s) as warnings: they flag new code, and existing code is hidden by the baseline`
        ]
      : []),
    ...(existingViolations > 0
      ? [`hide ${existingViolations} existing violation(s) so only new ones are flagged`]
      : []),
    ...(clients.length > 0 ? [`connect ${clients.join(", ")}`] : []),
    ...(publishNeeded && publish
      ? [`publish the contract with ${publish.name} (adds "invariant" to files and a prepack script)`]
      : []),
    // The GitHub Action is always last.
    ...(ciPossible ? [`add ${WORKFLOW_PATH}, which checks every pull request commit`] : [])
  ]

  type Mode = "quick" | "custom" | "none" | "stop"
  let mode: Mode
  let confirmed = false
  if (c.args.values["confirm-contract"] === true) {
    mode = "quick"
    confirmed = true
  } else if (yes) mode = "quick"
  else if (c.io.prompt) {
    const lines = planLines(true)
    say()
    say("Plan. Yes confirms the contract above is right, and does all of this:")
    if (lines.length === 0) say("  (nothing else to do)")
    for (const l of lines) say(`  - ${l}`)
    // A terminal gets the arrow menu. Esc or Ctrl+C counts as no. Without arrows, the typed answer still works.
    let picked: "yes" | "custom" | "no"
    if (c.io.select)
      picked =
        (await c.io.select("Looks right?", [
          { value: "yes", label: "Yes, apply this setup", key: "y" },
          { value: "custom", label: "Choose each step", key: "c" },
          { value: "no", label: "No, stop", key: "n" }
        ])) ?? "no"
    else {
      const a = (
        (await c.io.prompt(`${paint("accent", "◆")}  Looks right? [Y/n, or c to choose each step] `)) ?? ""
      )
        .trim()
        .toLowerCase()
      picked = a === "c" ? "custom" : a === "" || a.startsWith("y") ? "yes" : "no"
    }
    if (picked === "custom") mode = "custom"
    else if (picked === "yes") {
      mode = "quick"
      confirmed = true
    } else mode = "stop"
  } else mode = "none"

  if (mode === "stop") {
    say(
      `Stopped. Nothing was approved or added. The contract is compiled in ${path.relative(c.cwd, dir) || "."}/. If it looks wrong, check ${path.basename(configPath)} (or pass --paths, --contract) and run ${npx("setup")} again.`
    )
    print(c, outro("stopped", true))
    return 0
  }
  if (mode === "none") {
    say(
      `not asking (no terminal). Nothing was added. Re-run with --yes to add proposals, or --confirm-contract --as <name> once you have checked the contract above.`
    )
    print(c, outro("not asked", true))
    return 0
  }

  // Decisions. Quick takes the plan. Custom asks about each step, as setup used to.
  let chosen: Cand[] = top
  let approve = false
  let withRules = false
  let wantAgents = clients.length > 0
  let wantBaseline = existingViolations > 0
  let wantCi = ciPossible
  let wantPublish = publishNeeded
  if (mode === "quick") {
    if (only !== undefined) {
      const keep =
        only === "none" ? new Set<number>() : new Set(only.split(/\s*,\s*/).map((n) => Number(n) - 1))
      chosen = top.filter((_, i) => keep.has(i))
    }
    approve = confirmed
    withRules = confirmed && !noRules
  } else {
    confirmed = (await ask("Does this look like your design system?", false)) === true
    if (top.length > 0 && c.io.prompt) {
      const a = (
        (await c.io.prompt(
          `${paint("accent", "◆")}  Add the patterns? Enter for all, numbers to skip (like 2,3), n for none: `
        )) ?? ""
      )
        .trim()
        .toLowerCase()
      if (a === "n" || a === "no") chosen = []
      else if (a !== "") {
        const skip = new Set(a.split(/[,\s]+/).map((n) => Number(n) - 1))
        chosen = top.filter((_, i) => !skip.has(i))
      }
    }
    if (chosen.length > 0 && confirmed)
      approve = (await ask(`Approve ${chosen.length} pattern(s) as ${by}?`, true)) === true
    const n = chosen.reduce((m, x) => m + rulesFor(x).length, 0)
    if (approve && n > 0 && !noRules)
      withRules = (await ask(`Turn on ${n} starter rule(s) as warnings?`, true)) === true
    if (clients.length > 0) wantAgents = (await ask(`Connect ${clients.join(", ")}?`, true)) === true
    if (existingViolations > 0)
      wantBaseline =
        (await ask(
          `Hide ${existingViolations} existing violation(s) so only new ones are flagged?`,
          true
        )) === true
    if (publishNeeded && publish)
      wantPublish = (await ask(`Add the contract to what ${publish.name} publishes?`, true)) === true
    if (ciPossible)
      wantCi =
        wantsCi ||
        (await ask("Add a GitHub Action that checks every commit on pull requests?", true)) === true
  }
  if ((confirmed || chosen.length > 0) && !by)
    throw new CliError(
      "say who is deciding: --as <name> (or set INVARIANT_USER). Names are recorded, not authenticated."
    )
  say(
    confirmed
      ? paint("ok", `contract confirmed by ${by}.`)
      : "contract not confirmed, so nothing is approved and no rule is turned on."
  )

  // 4. Do it.
  const did: string[] = []
  const promoted: Array<{ id: string; cand: Cand }> = []
  if (chosen.length > 0 && by) {
    const taken = new Set<string>()
    const existing = existsSync(path.join(c.cwd, PATTERNS_FILE))
      ? ((
          JSON.parse(readFileSync(path.join(c.cwd, PATTERNS_FILE), "utf8")) as {
            patterns?: Array<{ id?: string }>
          }
        ).patterns ?? [])
      : []
    for (const p of existing) if (p.id) taken.add(p.id.replace(/^pattern:/, ""))
    for (const x of chosen) {
      const category = categoryOf(x)
      const label = directed.get(x.id)?.name ?? x.suggestedName
      let id = slugId(label, category)
      for (let n = 2; taken.has(id); n++) id = `${slugId(label, category)}-${n}`
      taken.add(id)
      const a = await sub("candidates", "accept", x.id, "--as", by, "--note", "added by invariant setup")
      const p =
        a.code === 0
          ? await sub(
              "candidates",
              "promote",
              x.id,
              "--id",
              id,
              "--as",
              by,
              "--category",
              category,
              ...(directed.get(x.id)?.name ? ["--name", label] : [])
            )
          : a
      if (p.code === 0) promoted.push({ id, cand: x })
      else flag(`skipped ${x.suggestedName}: ${(p.err || p.out).trim().split("\n")[0]}`)
    }
  }
  if (by)
    for (const x of denied)
      await sub("candidates", "reject", x.id, "--as", by, "--note", "denied during invariant setup")
  let approved = 0
  let rulesOn = 0
  if (promoted.length > 0) {
    const file = path.resolve(c.cwd, PATTERNS_FILE)
    const doc = JSON.parse(readFileSync(file, "utf8")) as { patterns: Array<Record<string, unknown>> }
    const at = c.io.clock()
    const globs = appPaths.map((p) => `${p.replace(/\/+$/, "")}/**`)
    for (const def of doc.patterns) {
      const hit = promoted.find((x) => x.id === def.id)
      if (!hit || def.approval !== undefined || !approve || !by) continue
      def.approval = {
        approvedBy: by,
        approvedAt: at,
        reference: `invariant setup, contract confirmed by ${by}`
      }
      approved++
      const rules = withRules ? rulesFor(hit.cand) : []
      if (rules.length > 0) {
        def.constraints = rules
        // The frameworks the pattern was seen in, from the files that show it.
        const seen = new Set(
          hit.cand.evidence.map((e) =>
            /\.vue$/i.test(e.file) ? "vue" : /\.(html?|ts)$/i.test(e.file) ? "angular" : "react"
          )
        )
        def.appliesTo = { paths: globs, frameworks: [...seen].sort() }
        rulesOn += rules.length
      }
    }
    writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`)
    const r = await sub("compile")
    if (r.code === 1)
      flag("compile reported errors after adding patterns; see invariant/invariant.diagnostics.json")
    did.push(
      approved > 0
        ? `patterns   ${approved} approved by ${by}. They guide agents.`
        : `patterns   ${promoted.length} added as proposals (not approved). Approve with \`${npx("review")}\` once you have read them.`
    )
    if (rulesOn > 0) did.push(`rules      ${rulesOn} starter rule(s), as warnings`)
  }

  if (posture !== undefined && config) {
    writeConfig(configPath, {
      ...config,
      enforcement: { ...config.enforcement, hooks: posture as "gate-errors" | "warn" | "off" }
    })
    did.push(
      `enforcement   writes are ${posture === "gate-errors" ? "blocked when they break an error rule" : posture === "warn" ? "never blocked; findings are reported after the write" : "not checked"} (enforcement.hooks = ${posture})`
    )
  }

  if (wantAgents)
    for (const client of clients) {
      const r = await sub("agent", "init", client)
      did.push(
        r.code === 0
          ? `agents     connected ${client}`
          : `agents     could not connect ${client}: ${(r.err || r.out).trim().split("\n")[0]}`
      )
    }
  else if (c.args.values["no-agent"] !== true && clients.length === 0)
    did.push(
      `agents     none detected. Run \`${npx("agent init <claude-code|cursor|codex|windsurf>")}\` when you use one.`
    )

  if (baselineWanted && wantBaseline) {
    const count = await countViolations()
    if (count > 0) {
      const w = await sub("validate", ...appPaths, "--update-baseline")
      did.push(
        `baseline   ${
          w.out
            .trim()
            .split("\n")[0]
            ?.replace(/^wrote [^:]+: /, "") ?? ""
        }`
      )
    }
  }

  if (wantPublish && publish) {
    const edits = applyPublish(publish)
    const ignored = [".gitignore", ".npmignore"].filter(
      (f) =>
        existsSync(path.join(c.cwd, f)) &&
        /^\/?invariant\/?$/m.test(readFileSync(path.join(c.cwd, f), "utf8"))
    )
    did.push(
      `publish    ${publish.name}: ${edits.join(" and ") || "already set up"}. Apps that install it can run ${npx("setup")}.${ignored.length > 0 ? ` Warning: ${ignored.join(" and ")} ignores invariant/, so it would not be published.` : ""}`
    )
  }

  let ciAdded = false
  if (wantCi) {
    mkdirSync(path.dirname(workflowFile), { recursive: true })
    writeFileSync(
      workflowFile,
      workflowYaml(
        appPaths,
        consumer ? installStepsFor((f) => existsSync(path.join(c.cwd, f))) : [],
        path.relative(c.cwd, dir).split(path.sep).join("/") || "."
      )
    )
    ciAdded = true
    did.push(
      `CI         wrote ${WORKFLOW_PATH}. Commit it with the ${path.relative(c.cwd, dir) || "invariant"}/ folder, so CI has a contract to check against.`
    )
  }
  const hasCi = ciAdded || existsSync(workflowFile)

  say()
  phase("done", "Done")
  step("set up")
  say(
    `contract   ${contract.components.length} components, ${contract.tokens.length} tokens (${path.relative(c.cwd, dir) || "."}/)`
  )
  for (const l of did) say(l)
  const first =
    promoted.length > 0 && withRules ? rulesFor((promoted[0] as { cand: Cand }).cand)[0] : undefined
  if (first && appPaths.length > 0)
    say(
      `\nSee it work: break this, then run ${npx(`validate ${appPaths.join(" ")}`)}\n  "${first.description}"`
    )

  // What setup did is above. This is the rest of the way: the steps that make the contract useful, in order.
  const out = path.relative(c.cwd, dir) || "invariant"
  const connected = wantAgents && clients.length > 0
  const unapproved = promoted.length > 0 && approved < promoted.length
  // The walkthrough is printed in the terminal, and sent to the browser as cards: it is not repeated in the browser's log.
  const tsay = (m = ""): void => {
    for (const l of fit(m)) print(c, l === "" ? gap() : line(l))
  }
  tsay()
  print(c, done("what to do next"))
  let n = 0
  const next = (title: string, ...lines: string[]): void => {
    c.io.report?.({ kind: "next", title, lines })
    tsay(`${++n}. ${title}`)
    for (const l of lines) tsay(l)
    tsay()
  }
  next(
    "Check the contract.",
    `Open ${out}/invariant.report.html: the components, tokens and patterns it found, and any conflicts between sources.`,
    `Conflicts need a person to decide: ${npx("review list")}`
  )
  if (unapproved)
    next(
      "Approve the patterns you agree with.",
      `Patterns are proposals until approved, and only approved ones guide AI tools. See them: ${npx("patterns list")}`,
      `Approve one: ${npx("review approve <id> --as <your name>")}`
    )
  next(
    "Use it in your AI tool.",
    ...(connected
      ? [
          `${clients.join(", ")} is connected: restart it, and approve the invariant MCP server when it asks. The server is read-only and serves this contract.`
        ]
      : [`Connect your tool: ${npx("agent init <claude-code|cursor|codex|windsurf>")}`]),
    "Skills teach it how to use the contract: invariant-build-ui (build screens from your real components and approved patterns), invariant-layout-composition, invariant-component-discovery, invariant-design-review and invariant-refactor-ui.",
    'Try: "Build a settings page with our design system", then ask it to review the result.'
  )
  next(
    "Keep the contract current.",
    `After components, tokens or patterns change, run ${npx("compile")} (add --watch while you work) and commit the ${out}/ folder with the change.`,
    `To show what changed, so a pull request can show what it does to the contract: ${npx("verify --fresh")} (it recompiles first).`
  )
  next(
    "Check code as it is written and merged.",
    ...(connected
      ? [
          "Files your AI tool writes are checked against the contract as it writes them (enforcement.hooks in invariant.config.json: gate-errors blocks, warn only reports, off checks nothing)."
        ]
      : []),
    hasCi
      ? `Commit ${WORKFLOW_PATH} with the ${out}/ folder. It checks every pull request commit.`
      : `Add this to CI: ${npx("verify --fresh")} && ${npx(`validate ${appPaths.length > 0 ? appPaths.join(" ") : "src/"}`)}`,
    `Check code yourself any time: ${npx(`validate ${appPaths.length > 0 ? appPaths.join(" ") : "src/"}`)}`
  )
  next("See what it caught.", `See the findings and fixes of your AI sessions: ${npx("enforcement report")}`)
  const shortForm = `These commands need nothing installed. The shorter \`${CLI_NAME} <command>\` works only after you install the CLI: npm install -g ${NPM_PACKAGE}`
  c.io.report?.({ kind: "next", title: "About these commands", lines: [shortForm] })
  tsay(shortForm)
  print(c, outro(`done in ${Math.max(1, Math.round((Date.now() - started) / 1000))}s`, true))
  return 0
}
