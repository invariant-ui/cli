import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { SCAN_RESULT_EXAMPLE, scanPrompt } from "@invariant/agent-kit"
import { afterAll, describe, expect, it } from "vitest"
import {
  type Agent,
  detectAgents,
  findOnPath,
  parseFindings,
  plain,
  runAgent,
  scanSummary
} from "./agents.js"

const made: string[] = []
afterAll(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true })
})
const temp = (): string => {
  const d = mkdtempSync(path.join(tmpdir(), "invariant-agent-"))
  made.push(d)
  return d
}
/** A shell script standing in for an agent. */
function script(dir: string, name: string, body: string, mode = 0o755): string {
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, name)
  writeFileSync(file, `#!/bin/sh\n${body}\n`)
  chmodSync(file, mode)
  return file
}
const claude = (command: string): Agent => ({ id: "claude-code", name: "Claude Code", command })

describe("detecting agents", () => {
  it("finds the agents that are on PATH and executable, and nothing else", () => {
    const bin = temp()
    script(bin, "claude", "exit 0")
    script(bin, "cursor-agent", "exit 0", 0o644)
    script(bin, "unrelated", "exit 0")
    const env = { PATH: `${bin}${path.delimiter}/nonexistent` }
    expect(detectAgents(env).map((a) => a.id)).toEqual(["claude-code"])
    expect(findOnPath("claude", env)).toBe(path.join(bin, "claude"))
    expect(findOnPath("codex", env)).toBeUndefined()
    expect(detectAgents({})).toEqual([])
  })

  it("lists them in a fixed order", () => {
    const bin = temp()
    for (const n of ["cursor-agent", "codex", "claude"]) script(bin, n, "exit 0")
    expect(detectAgents({ PATH: bin }).map((a) => a.id)).toEqual(["claude-code", "codex", "cursor"])
  })
})

describe("running an agent", () => {
  it("sends the prompt on standard input with read-only options, and returns what it prints", async () => {
    const dir = temp()
    const rec = path.join(dir, "rec")
    mkdirSync(rec)
    const cmd = script(
      dir,
      "claude",
      `printf '%s\\n' "$@" > "${rec}/args.txt"\ncat > "${rec}/stdin.txt"\necho '{"ok":1}'`
    )
    const r = await runAgent(claude(cmd), "the prompt", { cwd: dir, env: { PATH: "/usr/bin:/bin" } })
    expect(r).toEqual({ ok: true, text: '{"ok":1}\n' })
    expect(readFileSync(path.join(rec, "stdin.txt"), "utf8")).toBe("the prompt")
    expect(readFileSync(path.join(rec, "args.txt"), "utf8").trim().split("\n")).toEqual([
      "-p",
      "--tools",
      "Read,Grep,Glob",
      "--strict-mcp-config",
      "--no-session-persistence"
    ])
  })

  it("passes the prompt as the last argument to an agent that takes it that way", async () => {
    const dir = temp()
    const cmd = script(dir, "cursor-agent", `printf '%s' "$@" > "${dir}/args.txt"\necho done`)
    const r = await runAgent({ id: "cursor", name: "Cursor", command: cmd }, "PROMPT", {
      cwd: dir,
      env: { PATH: "/usr/bin:/bin" }
    })
    expect(r.ok).toBe(true)
    expect(readFileSync(path.join(dir, "args.txt"), "utf8")).toBe("-p--modeask--output-formattextPROMPT")
  })

  it("explains a failure with the first line the agent printed", async () => {
    const dir = temp()
    const cmd = script(dir, "claude", `echo "Error: Authentication required. Please log in." >&2\nexit 1`)
    expect(await runAgent(claude(cmd), "p", { cwd: dir, env: {} })).toEqual({
      ok: false,
      reason: "Claude Code stopped with exit code 1: Error: Authentication required. Please log in."
    })
  })

  it("stops an agent that does not answer in time, and one the person cancels", async () => {
    const dir = temp()
    const cmd = script(dir, "claude", "exec sleep 30")
    const slow = await runAgent(claude(cmd), "p", {
      cwd: dir,
      env: { PATH: "/usr/bin:/bin" },
      timeoutMs: 200
    })
    expect(slow).toEqual({ ok: false, reason: "Claude Code did not answer in 1 second" })
    const stop = new AbortController()
    setTimeout(() => stop.abort(), 100)
    expect(
      await runAgent(claude(cmd), "p", { cwd: dir, env: { PATH: "/usr/bin:/bin" }, signal: stop.signal })
    ).toEqual({
      ok: false,
      reason: "stopped"
    })
  })

  it("says so when the command cannot be started", async () => {
    const r = await runAgent(claude(path.join(temp(), "missing")), "p", { cwd: temp(), env: {} })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toMatch(/^Claude Code could not be started/)
  })
})

describe("reading an agent's reply", () => {
  const reply = (extra: object = {}): object => ({
    version: 1,
    directories: [{ path: "packages/ui/src/components", confidence: "high", reason: "used by 6 apps" }],
    ...extra
  })

  it("accepts the example the skill shows, so the skill and the parser cannot drift apart", () => {
    const r = parseFindings(JSON.stringify(SCAN_RESULT_EXAMPLE))
    expect(r.ok && r.directories.map((d) => d.path)).toEqual(["packages/ui/src/components"])
    expect(scanPrompt("scan")).toContain(JSON.stringify(SCAN_RESULT_EXAMPLE, null, 2))
  })

  it("finds the JSON in bare text, in a fenced block, or in prose around it, and forgives a trailing comma", () => {
    const body = JSON.stringify(reply())
    for (const text of [body, `\`\`\`json\n${body}\n\`\`\``, `Here you go:\n${body}\nHope that helps.`]) {
      const r = parseFindings(text)
      expect(r.ok && r.directories).toHaveLength(1)
    }
    // What a real agent returned: a comma before the closing brace.
    const commaed = `{\n  "version": 1,\n  "directories": [\n    { "path": "src", "confidence": "high", "reason": "a, b", },\n  ],\n  "notes": "x",\n}\n`
    const r = parseFindings(commaed)
    expect(r.ok && r.directories[0]).toEqual({ path: "src", confidence: "high", reason: "a, b" })
  })

  it("refuses a reply that is not the expected shape", () => {
    expect(parseFindings("I could not find it.")).toEqual({
      ok: false,
      reason: "the reply did not contain a JSON object"
    })
    expect(parseFindings(JSON.stringify(reply({ version: 2 }))).ok).toBe(false)
    expect(parseFindings(JSON.stringify({ version: 1 })).ok).toBe(false)
    expect(
      parseFindings(JSON.stringify({ version: 1, directories: [{ path: "a", confidence: "certain" }] })).ok
    ).toBe(false)
  })

  it("sets aside paths that are not inside the project, and drops duplicates and directories inside another one", () => {
    const r = parseFindings(
      JSON.stringify({
        version: 1,
        directories: [
          { path: "/etc", confidence: "high", reason: "" },
          { path: "../outside", confidence: "high", reason: "" },
          { path: "C:\\x", confidence: "high", reason: "" },
          { path: ".", confidence: "high", reason: "" },
          { path: "./src/", confidence: "high", reason: "the package" },
          { path: "src", confidence: "low", reason: "again" },
          { path: "src/layout", confidence: "high", reason: "inside src" },
          { path: "libs/ui", confidence: "medium", reason: "another" }
        ]
      })
    )
    expect(r.ok && r.directories.map((d) => d.path)).toEqual(["src", "libs/ui"])
    expect(r.ok && r.rejected).toEqual(["/etc", "../outside", "C:\\x", "."])
  })

  it("keeps at most 20 directories and cleans what it will print", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ path: `p${i}`, confidence: "low", reason: "x" }))
    const r = parseFindings(JSON.stringify({ version: 1, directories: many }))
    expect(r.ok && r.directories).toHaveLength(20)
    const dirty = parseFindings(
      JSON.stringify(reply({ notes: "\u001b[31mred\u001b[0m\u0007 line one\nline two" }))
    )
    expect(dirty.ok && dirty.notes).toBe("red line one line two")
    expect(plain("a\u001b]0;title\u0007b\u0000c")).toBe("abc")
    expect(plain("x".repeat(500), 10)).toHaveLength(10)
  })
})

describe("the summary sent to an agent", () => {
  it("lists packages and directories with names cleaned, and says why the scan is unsure", () => {
    const text = scanSummary({
      files: 120,
      directories: 30,
      packages: [
        {
          name: "@acme/ui\u001b[31m",
          dir: "packages/ui",
          role: "unknown",
          score: 10,
          confidence: "low",
          frameworks: ["react"],
          consumers: [],
          evidence: []
        }
      ],
      candidates: [],
      reasons: ["no directory scored high enough"]
    })
    expect(text).toContain("Scanned 120 files in 30 folders")
    expect(text).toContain("Why the scan is unsure: no directory scored high enough.")
    expect(text).toContain("- @acme/ui  at packages/ui  looks like: unknown  react")
    expect(text).not.toContain("\u001b")
  })

  it("says the person asked for a second opinion when the scan was not unsure", () => {
    const text = scanSummary({ files: 1, directories: 1, packages: [], candidates: [], reasons: [] })
    expect(text).toContain("The person asked for a second opinion on what the scan found.")
    expect(text).not.toContain("Why the scan is unsure")
  })
})
