import { spawn } from "node:child_process"
import { accessSync, constants, statSync } from "node:fs"
import path from "node:path"
import { SCAN_RESULT_VERSION } from "@invariant/agent-kit"
import { z } from "zod"
import { isSafeRelativePath } from "../config.js"
import type { DirectoryCandidate } from "./discover.js"
import type { Confidence, PackageRole } from "./recognize.js"

export type AgentId = "claude-code" | "codex" | "cursor"

export interface Agent {
  id: AgentId
  name: string
  /** The executable found on PATH. */
  command: string
}

interface Spec {
  name: string
  bin: string
  /** Options that make the run read-only: the agent can look at files and cannot change them or run commands. */
  args: string[]
  /** How the prompt reaches the agent: on standard input, or as the last argument. */
  prompt: "stdin" | "argument"
}

/**
 * The agents setup can start, and how each is held to reading. Claude Code gets an allowlist of read-only tools and no MCP
 * servers; Codex runs in its read-only sandbox; Cursor runs in `ask` mode, which does not edit. Windsurf and the IDE
 * versions of the others have no command to run, so they are not here.
 */
const SPECS: Record<AgentId, Spec> = {
  "claude-code": {
    name: "Claude Code",
    bin: "claude",
    prompt: "stdin",
    args: ["-p", "--tools", "Read,Grep,Glob", "--strict-mcp-config", "--no-session-persistence"]
  },
  codex: {
    name: "Codex",
    bin: "codex",
    prompt: "stdin",
    args: ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "-"]
  },
  cursor: {
    name: "Cursor",
    bin: "cursor-agent",
    prompt: "argument",
    args: ["-p", "--mode", "ask", "--output-format", "text"]
  }
}

const ORDER: AgentId[] = ["claude-code", "codex", "cursor"]
const MAX_OUTPUT = 4 * 1024 * 1024
const MAX_STDERR = 64 * 1024
export const AGENT_TIMEOUT_MS = 15 * 60 * 1000
const MAX_DIRECTORIES = 20

type Env = Readonly<Record<string, string | undefined>>

/** The first executable called `bin` on PATH, or undefined. It looks and does not run anything. */
export function findOnPath(bin: string, env: Env): string | undefined {
  const dirs = (env.PATH ?? "").split(path.delimiter).filter(Boolean)
  const exts =
    process.platform === "win32" ? ["", ...(env.PATHEXT ?? ".EXE;.CMD").toLowerCase().split(";")] : [""]
  for (const dir of dirs)
    for (const ext of exts) {
      const file = path.join(dir, bin + ext)
      try {
        if (!statSync(file).isFile()) continue
        accessSync(file, constants.X_OK)
        return file
      } catch {
        // Not here, or not executable.
      }
    }
  return undefined
}

/** The agents this machine can run from a terminal. A command on PATH is not proof the person is signed in to it. */
export function detectAgents(env: Env): Agent[] {
  const found: Agent[] = []
  for (const id of ORDER) {
    const spec = SPECS[id]
    const command = findOnPath(spec.bin, env)
    if (command) found.push({ id, name: spec.name, command })
  }
  return found
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: this removes terminal escape sequences from text an agent wrote
const ESCAPES = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g
// biome-ignore lint/suspicious/noControlCharactersInRegex: this removes control characters from text an agent wrote
const CONTROLS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g

/** Text from an agent or a repository, made safe to print: no escape sequences or control characters, one line, bounded. */
export function plain(text: string, max = 400): string {
  const one = text.replace(ESCAPES, "").replace(CONTROLS, "").replace(/\s+/g, " ").trim()
  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

const waited = (ms: number): string => {
  const [n, unit] =
    ms >= 60_000 ? [Math.round(ms / 60_000), "minute"] : [Math.max(1, Math.round(ms / 1000)), "second"]
  return `${n} ${unit}${n === 1 ? "" : "s"}`
}

export type RunResult = { ok: true; text: string } | { ok: false; reason: string }

/**
 * Starts the agent with the prompt and waits for its reply. The agent works in the project directory, read-only (see
 * `SPECS`). Nothing it prints is trusted: the caller parses and verifies it. A timeout or an abort stops the process.
 */
export function runAgent(
  agent: Agent,
  prompt: string,
  options: { cwd: string; env?: Env; timeoutMs?: number; signal?: AbortSignal }
): Promise<RunResult> {
  const spec = SPECS[agent.id]
  return new Promise((resolve) => {
    const child = spawn(agent.command, [...spec.args, ...(spec.prompt === "argument" ? [prompt] : [])], {
      cwd: options.cwd,
      env: { ...(options.env ?? {}) } as NodeJS.ProcessEnv,
      stdio: ["pipe", "pipe", "pipe"]
    })
    let out = ""
    let err = ""
    let tooBig = false
    let timedOut = false
    let cancelled = false
    let settled = false
    const finish = (r: RunResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      options.signal?.removeEventListener("abort", onAbort)
      resolve(r)
    }
    const stop = (): void => {
      child.kill("SIGTERM")
      setTimeout(() => child.kill("SIGKILL"), 3000).unref()
    }
    const onAbort = (): void => {
      cancelled = true
      stop()
    }
    const timer = setTimeout(() => {
      timedOut = true
      stop()
    }, options.timeoutMs ?? AGENT_TIMEOUT_MS)
    if (options.signal?.aborted) onAbort()
    else options.signal?.addEventListener("abort", onAbort, { once: true })
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (d: string) => {
      if (out.length + d.length > MAX_OUTPUT) {
        tooBig = true
        stop()
      } else out += d
    })
    child.stderr.on("data", (d: string) => {
      if (err.length < MAX_STDERR) err += d
    })
    // The agent may exit before it has read the prompt; that is reported by its exit code, not by a broken pipe.
    child.stdin.on("error", () => {})
    child.stdin.end(spec.prompt === "stdin" ? prompt : undefined)
    child.on("error", (e) =>
      finish({ ok: false, reason: `${spec.name} could not be started: ${plain(e.message, 200)}` })
    )
    child.on("close", (code) => {
      if (cancelled) return finish({ ok: false, reason: "stopped" })
      if (timedOut)
        return finish({
          ok: false,
          reason: `${spec.name} did not answer in ${waited(options.timeoutMs ?? AGENT_TIMEOUT_MS)}`
        })
      if (tooBig)
        return finish({ ok: false, reason: `${spec.name} printed more than ${MAX_OUTPUT / 1024 / 1024} MB` })
      if (code !== 0) {
        const why = plain((err.trim() || out.trim()).split("\n").find((l) => l.trim() !== "") ?? "", 200)
        return finish({
          ok: false,
          reason: `${spec.name} stopped with exit code ${code ?? "?"}${why ? `: ${why}` : ""}`
        })
      }
      finish({ ok: true, text: out })
    })
  })
}

export interface Suggestion {
  path: string
  confidence: Confidence
  reason: string
}

export type Findings =
  | { ok: true; directories: Suggestion[]; rejected: string[]; notes?: string }
  | { ok: false; reason: string }

const replySchema = z.object({
  version: z.literal(SCAN_RESULT_VERSION).default(SCAN_RESULT_VERSION),
  directories: z
    .array(
      z.object({
        path: z.string().min(1).max(300),
        confidence: z.enum(["high", "medium", "low"]),
        reason: z.string().max(2000).default("")
      })
    )
    .max(200),
  notes: z.string().max(5000).optional()
})

/** Removes a comma that sits before a closing bracket, outside strings: agents write them often, JSON does not allow them. */
function withoutTrailingCommas(text: string): string {
  let out = ""
  let inString = false
  let escaped = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string
    if (inString) {
      out += ch
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === ",") {
      let j = i + 1
      while (j < text.length && /\s/.test(text[j] as string)) j++
      if (text[j] === "}" || text[j] === "]") continue
    }
    out += ch
  }
  return out
}

function extractJson(text: string): unknown {
  const body = text.trim()
  const tries = [body, ...[...body.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1] ?? "")]
  const open = body.indexOf("{")
  const close = body.lastIndexOf("}")
  if (open >= 0 && close > open) tries.push(body.slice(open, close + 1))
  for (const t of tries)
    for (const candidate of [t, withoutTrailingCommas(t)])
      try {
        return JSON.parse(candidate)
      } catch {
        // Try the next form.
      }
  return undefined
}

/**
 * Reads an agent's reply. The reply is data from a model that read a repository: it is parsed against the schema, every
 * path must be a project-relative path, and text is cleaned before it can be shown. A bad path is set aside, not fatal.
 */
export function parseFindings(text: string): Findings {
  const raw = extractJson(text)
  if (raw === undefined) return { ok: false, reason: "the reply did not contain a JSON object" }
  const parsed = replySchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      reason: `the reply does not match the expected shape (${first?.path.join(".") || "root"}: ${first?.message})`
    }
  }
  const directories: Suggestion[] = []
  const rejected: string[] = []
  for (const d of parsed.data.directories) {
    const rel = d.path.trim().replace(/^\.\//, "").replace(/\/+$/, "")
    if (!isSafeRelativePath(rel) || rel === ".") rejected.push(plain(d.path, 120))
    else if (!directories.some((x) => x.path === rel))
      directories.push({ path: rel, confidence: d.confidence, reason: plain(d.reason, 400) })
  }
  const notes = parsed.data.notes ? plain(parsed.data.notes, 700) : undefined
  return {
    ok: true,
    // A directory inside another one the agent named is already covered by it.
    directories: directories
      .filter((d) => !directories.some((o) => o.path !== d.path && d.path.startsWith(`${o.path}/`)))
      .slice(0, MAX_DIRECTORIES),
    rejected,
    ...(notes ? { notes } : {})
  }
}

/** What the scan found, as the "Scan so far" section of the agent's prompt. Names come from the repository, so they are cleaned. */
export function scanSummary(input: {
  files: number
  directories: number
  packages: readonly PackageRole[]
  candidates: readonly DirectoryCandidate[]
  reasons: readonly string[]
}): string {
  const ui = input.packages.filter((p) => p.frameworks.length > 0 || p.role === "design-system")
  const shown = ui.slice(0, 40)
  const best = [...input.candidates]
    .sort((a, b) => b.classification.score - a.classification.score)
    .slice(0, 30)
  return [
    `Scanned ${input.files} files in ${input.directories} folders. Dependencies, build output and .gitignore entries are skipped.`,
    input.reasons.length > 0
      ? `Why the scan is unsure: ${input.reasons.map((r) => plain(r, 300)).join("; ")}.`
      : "The person asked for a second opinion on what the scan found.",
    "",
    `Packages that use a UI framework (${shown.length} of ${ui.length}; ${input.packages.length} packages in all):`,
    ...(shown.length > 0
      ? shown.map(
          (p) =>
            `- ${plain(p.name ?? p.dir, 80)}  at ${plain(p.dir, 120)}  looks like: ${p.role}  ${p.frameworks.join(", ")}`
        )
      : ["- none"]),
    "",
    `Directories the scan found components in (${best.length} of ${input.candidates.length}):`,
    ...(best.length > 0
      ? best.map(
          (c) =>
            `- ${plain(c.path, 160)}  ${c.componentCount} components  ${c.classification.confidence} confidence (${c.classification.score}/100)  ${c.recommendation}`
        )
      : ["- none"])
  ].join("\n")
}

/**
 * Marks a directory an agent named, once setup has looked at it and confirmed it holds components. `scanRecommended` is
 * true when the scan had already recommended it on its own: then the agent only agrees. Otherwise the choice is the
 * agent's, and the saved decision says so.
 */
export function withSuggestion(
  candidate: DirectoryCandidate,
  by: string,
  s: Suggestion,
  scanRecommended: boolean
): DirectoryCandidate {
  return {
    ...candidate,
    suggestion: { by, confidence: s.confidence, reason: s.reason },
    ...(scanRecommended ? {} : { foundBy: "agent" as const }),
    // An agent's doubt never lowers what the scan itself recommended.
    recommendation:
      candidate.recommendation === "recommended" || s.confidence !== "low" ? "recommended" : "potential"
  }
}
