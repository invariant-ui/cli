import { execSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { run } from "@invariant/cli"
import { FIXED_CLOCK } from "@invariant/compiler-core/testing"
import { afterAll, describe, expect, it } from "vitest"

const root = fileURLToPath(new URL("..", import.meta.url))
// The CLI version under test: these checks must not break when release-please bumps it.
const VERSION = JSON.parse(readFileSync(path.join(root, "apps/cli/package.json"), "utf8")).version as string
const made: string[] = []
afterAll(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true })
})

function project(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "invariant-setup-"))
  made.push(dir)
  cpSync(path.join(root, "fixtures/storybook/acme-ui"), dir, {
    recursive: true,
    filter: (s) => !s.includes("storybook-static")
  })
  cpSync(path.join(root, "fixtures/pattern-discovery/app"), path.join(dir, "app"), { recursive: true })
  return dir
}

/** Answers to the discovery questions that come first: keep all components, add none, accept the app folder, keep all 3 patterns. */
const REVIEW = ["", "", "", "", "", ""]

async function cli(
  cwd: string,
  argv: string[],
  answers?: string[],
  extra: { env?: Record<string, string>; io?: Record<string, unknown> } = {}
) {
  let out = ""
  let err = ""
  const asked: string[] = []
  const code = await run(argv, {
    cwd,
    stdout: (t) => (out += t),
    stderr: (t) => (err += t),
    clock: FIXED_CLOCK,
    env: extra.env ?? {},
    ...extra.io,
    ...(answers
      ? {
          prompt: async (q: string) => {
            asked.push(q)
            return answers.shift()
          }
        }
      : {})
  })
  return { code, out, err, asked }
}
const patterns = (dir: string) =>
  JSON.parse(readFileSync(path.join(dir, "invariant.patterns.json"), "utf8")) as {
    patterns: Array<{ id: string; approval?: { approvedBy: string; reference?: string } }>
  }

/** Gives the package a name and some fields, keeping what it already declares (React, peer dependencies). */
const writeMeta = (dir: string, extra: Record<string, unknown>) => {
  const file = path.join(dir, "package.json")
  const existing = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {}
  writeFileSync(file, JSON.stringify({ ...existing, name: "@acme/ui", version: "1.0.0", ...extra }, null, 2))
}

describe("invariant setup", () => {
  it("without a confirmed contract, adds proposals and approves nothing", async () => {
    const dir = project()
    const r = await cli(dir, ["setup", "--yes", "--as", "ana"])
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/compiled: \d+ components/)
    expect(r.out).toMatch(/contract not confirmed, so nothing is approved and no rule is turned on/)
    expect(r.out).toMatch(/patterns {3}3 added as proposals \(not approved\)/)
    const list = patterns(dir).patterns
    expect(list.length).toBeGreaterThan(0)
    expect(list.every((p) => p.approval === undefined)).toBe(true)
    expect(JSON.stringify(list)).not.toContain('"constraints"')
    expect(r.out).not.toMatch(/rules /)
    expect(existsSync(path.join(dir, "invariant.candidate-reviews.json"))).toBe(true)
  })

  it("approves patterns and turns on starter rules only after the contract is confirmed", async () => {
    const dir = project()
    const r = await cli(dir, ["setup", "--confirm-contract", "--as", "ana"])
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/contract confirmed by ana/)
    expect(r.out).toMatch(/patterns {3}3 approved by ana/)
    expect(r.out).toMatch(/rules {6}\d+ starter rule\(s\), as warnings/)
    expect(r.out).toMatch(/See it work/)
    expect(r.out).toMatch(/^┌ {2}invariant setup/m)
    expect(r.out.trimEnd().split("\n").at(-1)).toMatch(/^└ {2}done in \ds$/)
    for (const p of patterns(dir).patterns) {
      expect(p.approval?.approvedBy).toBe("ana")
      expect(p.approval?.reference).toMatch(/contract confirmed by ana/)
    }
    const defs = patterns(dir).patterns as Array<{
      id: string
      constraints?: Array<{ enforce: object; kind: string }>
      appliesTo?: { paths: string[] }
    }>
    const withRules = defs.filter((d) => d.constraints)
    expect(withRules.length).toBeGreaterThan(0)
    for (const d of withRules) {
      expect(d.appliesTo?.paths).toEqual(["app/**"])
      for (const k of d.constraints ?? [])
        expect(k.enforce).toEqual({ severity: "warning", enforcement: "warn" })
    }
    const inspected = await cli(dir, ["patterns", "inspect", defs[0]?.id as string])
    expect(inspected.out).not.toMatch(/NOT APPROVED/)
  })

  it("--only adds just the numbered patterns, --posture writes the enforcement setting, and bad values are refused", async () => {
    const dir = project()
    const r = await cli(dir, [
      "setup",
      "--confirm-contract",
      "--as",
      "ana",
      "--only",
      "1,3",
      "--posture",
      "warn",
      "--no-ci",
      "--no-agent"
    ])
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/patterns {3}2 approved by ana/)
    expect(patterns(dir).patterns).toHaveLength(2)
    expect(r.out).toMatch(/enforcement[\s\S]*never blocked[\s\S]*enforcement\.hooks[\s│]*= warn/)
    const config = JSON.parse(readFileSync(path.join(dir, "invariant.config.json"), "utf8"))
    expect(config.enforcement).toEqual({ hooks: "warn" })
    expect(config.sources.length).toBeGreaterThan(0)

    const none = project()
    const n = await cli(none, [
      "setup",
      "--confirm-contract",
      "--as",
      "ana",
      "--only",
      "none",
      "--no-ci",
      "--no-agent"
    ])
    expect(n.out).not.toMatch(/patterns {3}/)
    expect(existsSync(path.join(none, "invariant.patterns.json"))).toBe(false)

    expect((await cli(project(), ["setup", "--posture", "loud"])).code).toBe(2)
    expect((await cli(project(), ["setup", "--only", "one"])).code).toBe(2)
  })

  it("a starter rule flags new code and, as a warning, does not fail the build", async () => {
    const dir = project()
    await cli(dir, ["setup", "--confirm-contract", "--as", "ana", "--no-ci", "--no-agent"])
    writeFileSync(
      path.join(dir, "app/pages/NewModal.tsx"),
      'import { Modal } from "@acme/ui"\nexport const N = () => <Modal open title="x" />\n'
    )
    const r = await cli(dir, ["validate", "app", "--format", "json"])
    const out = JSON.parse(r.out) as { violations: Array<{ code: string; file: string; severity: string }> }
    const hit = out.violations.filter((v) => v.file === "app/pages/NewModal.tsx")
    expect(hit.map((v) => v.code)).toContain("pattern-required-child-missing")
    expect(hit.every((v) => v.severity === "warning")).toBe(true)
    expect(r.code).toBe(0)
    // The same rule on the code that was already there is hidden by the baseline.
    expect(out.violations.filter((v) => v.file !== "app/pages/NewModal.tsx")).toEqual([])
  })

  it("--no-rules approves patterns without turning on any rule", async () => {
    const dir = project()
    const r = await cli(dir, ["setup", "--confirm-contract", "--as", "ana", "--no-rules"])
    expect(r.out).toMatch(/patterns {3}3 approved by ana/)
    expect(r.out).not.toMatch(/starter rule/)
    expect(JSON.stringify(patterns(dir).patterns)).not.toContain('"constraints"')
  })

  it("asks once. Yes confirms the contract and does the whole plan", async () => {
    const dir = project()
    const r = await cli(dir, ["setup", "--as", "ana"], [...REVIEW, "y"])
    expect(r.asked).toHaveLength(7)
    expect(r.asked.filter((q) => /Looks right\?/.test(q))).toHaveLength(1)
    expect(r.out).toMatch(/Plan\. Yes confirms the contract above is right/)
    expect(r.out).toMatch(/approved by ana/)
    expect(r.out).toMatch(/starter rule\(s\) as warnings/)
    expect(patterns(dir).patterns.every((p) => p.approval?.approvedBy === "ana")).toBe(true)
  })

  it("asking and answering just Enter means yes", async () => {
    const dir = project()
    const r = await cli(dir, ["setup", "--as", "ana"], [...REVIEW, ""])
    expect(patterns(dir).patterns.every((p) => p.approval?.approvedBy === "ana")).toBe(true)
    expect(r.asked).toHaveLength(7)
  })

  it("no stops: nothing is approved, added or written", async () => {
    const dir = project()
    const r = await cli(dir, ["setup", "--as", "ana"], [...REVIEW, "n"])
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/Stopped\. Nothing was approved or added/)
    expect(existsSync(path.join(dir, "invariant.patterns.json"))).toBe(false)
    expect(existsSync(path.join(dir, "invariant.baseline.json"))).toBe(false)
    expect(existsSync(path.join(dir, "invariant"))).toBe(true)
  })

  it("c asks about each step, and a no on the contract keeps patterns unapproved", async () => {
    const dir = project()
    // contract? no. which patterns? skip 1. baseline: yes (the rest default to yes).
    const r = await cli(dir, ["setup", "--as", "ana"], [...REVIEW, "c", "n", "1", "y"])
    expect(r.asked.some((q) => /Looks right\?/.test(q))).toBe(true)
    expect(r.asked.some((q) => /Does this look like your design system/.test(q))).toBe(true)
    expect(r.asked.some((q) => /Approve \d+ pattern/.test(q))).toBe(false)
    expect(r.out).toMatch(/contract not confirmed/)
    const list = patterns(dir).patterns
    expect(list).toHaveLength(2)
    expect(list.every((p) => p.approval === undefined)).toBe(true)
  })

  it("lets the person deny a pattern, and rename and re-categorise another", async () => {
    const dir = project()
    // components: all, none added. apps: accept. pattern 1 deny, 2 edit (name, category), 3 keep. Then the plan: yes.
    const r = await cli(
      dir,
      ["setup", "--as", "ana", "--no-ci", "--no-agent"],
      ["", "", "", "d", "e", "Account home", "layout", "", "y"]
    )
    expect(r.code).toBe(0)
    const list = patterns(dir).patterns
    expect(list).toHaveLength(2)
    expect(list.some((p) => p.id.startsWith("layout.account-home"))).toBe(true)
    const reviews = JSON.parse(readFileSync(path.join(dir, "invariant.candidate-reviews.json"), "utf8")) as {
      reviews: Array<{ decision: string }>
    }
    expect(reviews.reviews.filter((x) => x.decision === "rejected")).toHaveLength(1)
  })

  it("lets the person untick a directory, add a single component file, and see what is in it", async () => {
    const dir = project()
    // dirs: untick all. menu: add, the file. menu: view, directory 2. menu: confirm. Then the plan: yes.
    const r = await cli(
      dir,
      ["setup", "--as", "ana", "--no-ci", "--no-agent", "--only", "none"],
      ["n", "a", "src/Button.tsx", "v", "2", "c", "y"]
    )
    expect(r.asked[0]).toMatch(/Enter keeps the \[x\] ones/)
    expect(r.out).toMatch(/added src\/Button\.tsx: 2 components/)
    expect(r.out).toMatch(/Button {2}src\/Button\.tsx:\d+ {2}\(react/)
    const config = JSON.parse(readFileSync(path.join(dir, "invariant.config.json"), "utf8")) as {
      componentSources: Array<Record<string, string>>
    }
    expect(config.componentSources).toContainEqual({
      path: "src",
      type: "directory",
      source: "discovered",
      status: "excluded"
    })
    expect(config.componentSources).toContainEqual({
      path: "src/Button.tsx",
      type: "file",
      source: "user",
      status: "approved"
    })
    const contract = JSON.parse(
      readFileSync(path.join(dir, "invariant/invariant.contract.json"), "utf8")
    ) as {
      components: Array<{ name: string }>
    }
    // Only Button is in scope, and only exported components reach the contract.
    expect(contract.components.map((x) => x.name)).toEqual(["Button"])
  })

  it("uses the checklist and menu when the terminal has them", async () => {
    const dir = project()
    const asked: string[] = []
    const code = await run(["setup", "--as", "ana", "--no-ci", "--no-agent", "--only", "none"], {
      cwd: dir,
      stdout: () => {},
      stderr: () => {},
      clock: FIXED_CLOCK,
      env: {},
      prompt: async (q: string) => {
        asked.push(q)
        return ""
      },
      multiselect: async <T extends string>(
        _q: string,
        options: ReadonlyArray<{ value: T; label: string }>
      ) => options.map((o) => o.value),
      select: async <T extends string>(q: string): Promise<T | undefined> =>
        (/Next\?/.test(q) ? "confirm" : "yes") as T
    })
    expect(code).toBe(0)
    expect(asked.some((q) => /Enter keeps the/.test(q))).toBe(false)
    const config = JSON.parse(readFileSync(path.join(dir, "invariant.config.json"), "utf8")) as {
      componentSources: Array<{ status: string }>
    }
    expect(config.componentSources.some((s) => s.status === "approved")).toBe(true)
  })

  it("--include names the sources, --exclude rejects, and a path with no components is refused", async () => {
    const dir = project()
    const r = await cli(dir, [
      "setup",
      "--as",
      "ana",
      "--no-ci",
      "--no-agent",
      "--include",
      "src",
      "--exclude",
      "app/other"
    ])
    expect(r.code).toBe(0)
    const config = JSON.parse(readFileSync(path.join(dir, "invariant.config.json"), "utf8")) as {
      componentSources: Array<{ path: string; status: string; source: string }>
    }
    expect(config.componentSources).toContainEqual({
      path: "src",
      type: "directory",
      source: "user",
      status: "approved"
    })
    expect(config.componentSources).toContainEqual({
      path: "app/other",
      type: "directory",
      source: "user",
      status: "excluded"
    })
    const other = project()
    mkdirSync(path.join(other, "empty"))
    const bad = await cli(other, ["setup", "--include", "empty", "--as", "ana"])
    expect(bad.code).not.toBe(0)
    expect(bad.err).toMatch(/--include: no components found in empty/)
  })

  it("repeats safely: an exclusion stays excluded, an added file stays in, and the config does not change", async () => {
    const dir = project()
    const flags = ["--as", "ana", "--no-ci", "--no-agent", "--yes"]
    await cli(dir, ["setup", ...flags, "--include", "src/Button.tsx", "--exclude", "src"])
    const read = () =>
      JSON.parse(readFileSync(path.join(dir, "invariant.config.json"), "utf8")) as {
        componentSources: unknown[]
        discovery: unknown
        sources: unknown[]
      }
    const first = read()
    expect(first.componentSources).toEqual(
      expect.arrayContaining([
        { path: "src", type: "directory", source: "user", status: "excluded" },
        { path: "src/Button.tsx", type: "file", source: "user", status: "approved" },
        { path: "app/pages", type: "directory", source: "discovered", status: "pending" }
      ])
    )
    const again = await cli(dir, ["setup", ...flags, "--rediscover"])
    expect(again.code).toBe(0)
    expect(read()).toEqual(first)
  })

  it("leaves out a component another one uses, without breaking the contract", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "invariant-xref-"))
    made.push(dir)
    mkdirSync(path.join(dir, "src"))
    const w = (f: string, body: string) => writeFileSync(path.join(dir, f), body)
    w(
      "package.json",
      JSON.stringify({
        name: "@x/ui",
        version: "1.0.0",
        description: "A component library",
        main: "src/index.ts",
        peerDependencies: { react: "^18" }
      })
    )
    w("src/index.ts", 'export * from "./Button"\nexport * from "./Card"\nexport * from "./Panel"\n')
    w(
      "src/Button.tsx",
      "export function Button(p: { label: string }) { return <button>{p.label}</button> }\n"
    )
    w(
      "src/Card.tsx",
      'import { Button } from "./Button"\nexport function Card(p: { t: string }) { return <div>{p.t}<Button label="x" /></div> }\n'
    )
    w(
      "src/Panel.tsx",
      'import { Card } from "./Card"\nexport function Panel(p: { t: string }) { return <section><Card t={p.t} /></section> }\n'
    )
    const r = await cli(dir, [
      "setup",
      "--yes",
      "--as",
      "ana",
      "--no-ci",
      "--no-agent",
      "--no-publish",
      "--exclude",
      "src/Button.tsx"
    ])
    expect(r.code).toBe(0)
    const config = JSON.parse(readFileSync(path.join(dir, "invariant.config.json"), "utf8")) as {
      componentSources: Array<Record<string, string>>
    }
    expect(config.componentSources).toContainEqual({
      path: "src/Button.tsx",
      type: "file",
      source: "user",
      status: "excluded"
    })
    const contract = JSON.parse(
      readFileSync(path.join(dir, "invariant/invariant.contract.json"), "utf8")
    ) as {
      components: Array<{ name: string; composition: Array<{ target: string }> }>
    }
    expect(contract.components.map((c) => c.name)).toEqual(["Card", "Panel"])
    expect(contract.components.find((c) => c.name === "Card")?.composition).toEqual([])
    expect((await cli(dir, ["verify", "--fresh"])).code).toBe(0)
  })

  it("--discover-only prints what it found as JSON and writes nothing", async () => {
    const dir = project()
    const r = await cli(dir, ["setup", "--discover-only"])
    expect(r.code).toBe(0)
    const found = JSON.parse(r.out) as {
      recognition: { kind: string; packages: Array<{ role: string }> }
      candidates: Array<{ path: string; recommendation: string; classification: { evidence: unknown[] } }>
    }
    expect(found.recognition.kind).toBe("component-library")
    expect(found.candidates.find((c) => c.path === "src")).toMatchObject({ recommendation: "recommended" })
    expect(existsSync(path.join(dir, "invariant.config.json"))).toBe(false)
  })

  it("does not ask or add anything when there is no terminal and no --yes", async () => {
    const dir = project()
    const r = await cli(dir, ["setup", "--as", "ana"])
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/need your confirmation, and there is no terminal to ask/)
    expect(r.out).toMatch(/--yes[\s\S]*--include/)
    expect(existsSync(path.join(dir, "invariant.config.json"))).toBe(false)
    expect(existsSync(path.join(dir, "invariant.patterns.json"))).toBe(false)
  })

  it("connects the AI tools it finds, and skips with --no-agent", async () => {
    const dir = project()
    mkdirSync(path.join(dir, ".cursor"))
    const r = await cli(dir, ["setup", "--yes", "--as", "ana"])
    expect(r.out).toMatch(/connected cursor/)
    expect(existsSync(path.join(dir, ".cursor/mcp.json"))).toBe(true)
    const dir2 = project()
    mkdirSync(path.join(dir2, ".cursor"))
    await cli(dir2, ["setup", "--yes", "--as", "ana", "--no-agent"])
    expect(existsSync(path.join(dir2, ".cursor/mcp.json"))).toBe(false)
  })

  it("says so when it finds no application folder", async () => {
    const dir = project()
    rmSync(path.join(dir, "app"), { recursive: true })
    const r = await cli(dir, ["setup", "--yes", "--as", "ana"])
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/skipped src: it holds the design system's own components/)
    expect(r.out).toMatch(/no application folder found/)
    expect(existsSync(path.join(dir, "invariant.baseline.json"))).toBe(false)
  })
})

describe("setup: a scan that is not sure, and an AI agent that helps", () => {
  /** Five components in a folder no convention names, and nothing else to go on: the scan cannot tell it is the design system. */
  function unsureProject(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "invariant-unsure-"))
    made.push(dir)
    mkdirSync(path.join(dir, "src/widgets"), { recursive: true })
    mkdirSync(path.join(dir, "src/pages"), { recursive: true })
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        name: "shop",
        private: true,
        version: "1.0.0",
        main: "src/index.ts",
        dependencies: { react: "^18" }
      })
    )
    const names = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"]
    for (const n of names)
      writeFileSync(
        path.join(dir, `src/widgets/${n}.tsx`),
        `import React from "react"\nexport function ${n}(props: { label: string }) { return <div>{props.label}</div> }\n`
      )
    writeFileSync(
      path.join(dir, "src/index.ts"),
      `${names.map((n) => `export { ${n} } from "./widgets/${n}"`).join("\n")}\n`
    )
    writeFileSync(
      path.join(dir, "src/pages/Home.tsx"),
      `import React from "react"\nimport { Alpha } from "../widgets/Alpha"\nexport function Home() { return <Alpha label="x" /> }\n`
    )
    return dir
  }

  /** A `claude` on PATH that records the prompt it was given and either answers or fails. */
  function fakeAgent(behavior: { reply: object | string } | { fail: string }) {
    const bin = mkdtempSync(path.join(tmpdir(), "invariant-bin-"))
    made.push(bin)
    const record = path.join(bin, "record")
    mkdirSync(record)
    const body =
      "reply" in behavior
        ? `cat > "${record}/prompt.txt"\ncat <<'EOF'\n${typeof behavior.reply === "string" ? behavior.reply : JSON.stringify(behavior.reply)}\nEOF`
        : `cat > "${record}/prompt.txt"\necho "${behavior.fail}" >&2\nexit 1`
    writeFileSync(path.join(bin, "claude"), `#!/bin/sh\n${body}\n`, { mode: 0o755 })
    return {
      env: { PATH: `${bin}:/usr/bin:/bin` },
      ran: () => existsSync(path.join(record, "prompt.txt")),
      prompt: () => readFileSync(path.join(record, "prompt.txt"), "utf8")
    }
  }
  const config = (dir: string) =>
    JSON.parse(readFileSync(path.join(dir, "invariant.config.json"), "utf8")) as {
      sources: unknown[]
      componentSources?: Array<Record<string, string>>
    }
  /** The output with its frame removed, so a sentence the terminal wrapped reads as one. */
  const flat = (out: string): string => out.replace(/\s*\n│\s+/g, " ")
  const flags = [
    "setup",
    "--as",
    "ana",
    "--no-ci",
    "--no-agent",
    "--only",
    "none",
    "--no-baseline",
    "--paths",
    "src/pages"
  ]

  it("offers the agent, checks what it names, keeps its confidence and reason, and approves nothing before the person confirms", async () => {
    const dir = unsureProject()
    const agent = fakeAgent({
      reply: {
        version: 1,
        directories: [
          {
            path: "src/widgets",
            confidence: "high",
            reason: "Five shared widgets, all exported from src/index.ts"
          },
          { path: "src/ghost", confidence: "high", reason: "made up" },
          { path: "../outside", confidence: "high", reason: "escapes the project" }
        ],
        notes: "Looks like one small design system."
      }
    })
    // menu: ask Claude Code. checklist: keep what is ticked. menu: confirm. plan: yes.
    const r = await cli(dir, flags, ["1", "", "c", "y"], { env: agent.env })
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/not confident about the component directories: no directory scored high enough/)
    expect(r.out).toMatch(/found Claude Code/)
    expect(flat(r.out)).toMatch(/It can only read files .* sent to its provider, under your account/)
    expect(agent.ran()).toBe(true)
    // The prompt is the skill plus what the scan found.
    expect(agent.prompt()).toContain("Find where the design system's components live")
    expect(agent.prompt()).toContain("src/widgets")
    expect(agent.prompt()).toContain("This is an automated run")
    // What it named is checked: a real directory is taken, the others are explained and dropped.
    expect(r.out).toMatch(/src\/widgets {2}5 components {2}\(high\) Five shared widgets/)
    expect(r.out).toMatch(/named src\/ghost: src\/ghost does not exist/)
    expect(r.out).toMatch(/named \.\.\/outside, which is not a path inside the project/)
    expect(r.out).toMatch(/Claude Code noted: Looks like one small design system\./)
    expect(r.out).toMatch(/Claude Code named 2 directories; 1 holds components setup can find/)
    // The saved decision says who chose it, how sure it was and why.
    expect(config(dir).componentSources).toEqual([
      {
        path: "src/widgets",
        type: "directory",
        source: "agent",
        status: "approved",
        note: "suggested by Claude Code (high confidence): Five shared widgets, all exported from src/index.ts"
      }
    ])
    const contract = JSON.parse(
      readFileSync(path.join(dir, "invariant/invariant.contract.json"), "utf8")
    ) as {
      components: Array<{ name: string }>
    }
    expect(contract.components.map((x) => x.name).sort()).toEqual([
      "Alpha",
      "Beta",
      "Delta",
      "Epsilon",
      "Gamma"
    ])
  })

  it("does not move on until the person confirms: stopping at the menu writes nothing and runs no agent", async () => {
    const dir = unsureProject()
    const agent = fakeAgent({ reply: {} })
    const r = await cli(dir, flags, ["4"], { env: agent.env })
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/Stopped\. Nothing was written\./)
    expect(agent.ran()).toBe(false)
    expect(existsSync(path.join(dir, "invariant.config.json"))).toBe(false)
    expect(existsSync(path.join(dir, "invariant"))).toBe(false)
  })

  it("shows why the agent failed and offers the choices again, and the person can name the directory themselves", async () => {
    const dir = unsureProject()
    const agent = fakeAgent({ fail: "Error: Authentication required. Please log in." })
    // menu: ask Claude Code (fails). menu again: choose myself. nothing is recommended, so nothing is ticked: pick 2 (src/widgets). confirm. plan: yes.
    const r = await cli(dir, flags, ["1", "2", "2", "c", "y"], { env: agent.env })
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/Claude Code: Claude Code stopped with exit code 1: Error: Authentication required/)
    expect(r.out).toMatch(/2\. \[ \] src\/widgets · 5 components · low confidence/)
    expect(config(dir).componentSources).toEqual([
      { path: "src/pages", type: "directory", source: "discovered", status: "excluded" },
      { path: "src/widgets", type: "directory", source: "discovered", status: "approved" }
    ])
  })

  it("says it cannot use an answer that is not JSON, and goes back to the choices", async () => {
    const dir = unsureProject()
    const agent = fakeAgent({ reply: "I looked around but I am not sure where they are." })
    const r = await cli(dir, flags, ["1", "4"], { env: agent.env })
    expect(r.out).toMatch(
      /Claude Code answered, but setup cannot use the answer: the reply did not contain a JSON object/
    )
    expect(r.out).toMatch(/Stopped\. Nothing was written\./)
  })

  it("takes the choices from the arrow menu when the terminal has one", async () => {
    const dir = unsureProject()
    const agent = fakeAgent({
      reply: {
        version: 1,
        directories: [{ path: "src/widgets", confidence: "medium", reason: "shared widgets" }]
      }
    })
    const questions: string[] = []
    const r = await cli(dir, flags, ["y"], {
      env: agent.env,
      io: {
        multiselect: async <T extends string>(
          _q: string,
          options: ReadonlyArray<{ value: T; ticked?: boolean }>
        ) => options.filter((o) => o.ticked !== false).map((o) => o.value),
        select: async <T extends string>(
          q: string,
          choices: ReadonlyArray<{ value: T; label: string }>
        ): Promise<T | undefined> => {
          questions.push(q)
          if (/How do you want to go on/.test(q))
            return choices.find((c) => /Claude Code/.test(c.label))?.value
          return (/Next\?/.test(q) ? "confirm" : "yes") as T
        }
      }
    })
    expect(r.code).toBe(0)
    expect(questions[0]).toBe("How do you want to go on?")
    expect(config(dir).componentSources?.[0]).toMatchObject({
      path: "src/widgets",
      source: "agent",
      status: "approved"
    })
  })

  it("never starts an agent with --yes, and without a terminal says what it needs and writes nothing", async () => {
    const dir = unsureProject()
    const agent = fakeAgent({ reply: { version: 1, directories: [] } })
    const yes = await cli(dir, ["setup", "--yes", "--as", "ana", "--no-ci", "--no-agent"], undefined, {
      env: agent.env
    })
    expect(yes.code).toBe(0)
    expect(yes.out).toMatch(/need your confirmation \(no directory scored high enough to recommend/)
    expect(flat(yes.out)).toMatch(/Nothing was recommended, so --yes had nothing to accept/)
    expect(flat(yes.out)).toMatch(/invariant-setup skill/)
    const bare = await cli(dir, ["setup", "--as", "ana", "--no-ci", "--no-agent"], undefined, {
      env: agent.env
    })
    expect(flat(bare.out)).toMatch(
      /there is no terminal to ask\. Re-run with --yes .* or name them with --include/
    )
    expect(agent.ran()).toBe(false)
    expect(existsSync(path.join(dir, "invariant.config.json"))).toBe(false)
  })

  it("--include is the person's answer: no question, no agent", async () => {
    const dir = unsureProject()
    const agent = fakeAgent({ reply: {} })
    const r = await cli(
      dir,
      ["setup", "--include", "src/widgets", "--as", "ana", "--no-ci", "--no-agent"],
      undefined,
      {
        env: agent.env
      }
    )
    expect(r.code).toBe(0)
    expect(agent.ran()).toBe(false)
    // The scan's other directory is recorded as pending: still undecided, never approved by a rerun.
    expect(config(dir).componentSources).toEqual([
      { path: "src/pages", type: "directory", source: "discovered", status: "pending" },
      { path: "src/widgets", type: "directory", source: "user", status: "approved" }
    ])
  })

  it("with no agent on the machine, says so and goes on to the review", async () => {
    const dir = unsureProject()
    // review: keep the (empty) selection, add src/widgets by hand. confirm. plan: yes.
    const r = await cli(dir, flags, ["", "a", "src/widgets", "c", "y"], { env: { PATH: "/usr/bin:/bin" } })
    expect(r.out).toMatch(/No AI agent to ask was found on this machine/)
    expect(config(dir).componentSources).toContainEqual({
      path: "src/widgets",
      type: "directory",
      source: "user",
      status: "approved"
    })
  })

  it("finds nothing to confirm: asks, and compiling everything the packages export is a choice the person makes", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "invariant-none-"))
    made.push(dir)
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", dependencies: { react: "^18" } })
    )
    mkdirSync(path.join(dir, "src"))
    writeFileSync(path.join(dir, "src/index.ts"), "export const x = 1\n")
    const noTerminal = await cli(dir, ["setup", "--as", "ana", "--no-ci", "--no-agent"])
    expect(noTerminal.out).toMatch(/no React, Vue or Angular components were found/)
    expect(existsSync(path.join(dir, "invariant.config.json"))).toBe(false)
    // menu without an agent: 1 enter myself, 2 compile everything, 3 stop.
    const chosen = await cli(
      dir,
      ["setup", "--as", "ana", "--no-ci", "--no-agent", "--only", "none"],
      ["2", "n"]
    )
    expect(chosen.out).toMatch(/compiling everything the detected sources export, as you chose/)
    expect(config(dir).componentSources).toBeUndefined()
  })
})

describe("setup reads every file, however many there are", () => {
  it("finds a design system that sorts after more than 20,000 other files", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "invariant-big-"))
    made.push(dir)
    // Walked first, alphabetically: this is what used to fill the limit before `packages/` was reached.
    for (let d = 0; d < 100; d++) mkdirSync(path.join(dir, `apps/web/gen/d${d}`), { recursive: true })
    for (let i = 0; i < 20_500; i++) writeFileSync(path.join(dir, `apps/web/gen/d${i % 100}/f${i}.txt`), "")
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "big", private: true, workspaces: ["packages/*"] })
    )
    mkdirSync(path.join(dir, "packages/ui/src/components"), { recursive: true })
    writeFileSync(
      path.join(dir, "packages/ui/package.json"),
      JSON.stringify({
        name: "@big/design-system",
        version: "1.0.0",
        description: "Component library and design system",
        main: "src/index.ts",
        peerDependencies: { react: "^18" },
        scripts: { build: "tsc" }
      })
    )
    const names = ["Button", "Card", "Dialog", "Input", "Select", "Table"]
    for (const n of names)
      writeFileSync(
        path.join(dir, `packages/ui/src/components/${n}.tsx`),
        `import React from "react"\nexport function ${n}(props: { label: string }) { return <div role="group">{props.label}</div> }\n`
      )
    writeFileSync(
      path.join(dir, "packages/ui/src/index.ts"),
      `${names.map((n) => `export { ${n} } from "./components/${n}"`).join("\n")}\n`
    )
    const r = await cli(dir, ["setup", "--yes", "--as", "ana", "--no-ci", "--no-agent", "--no-baseline"])
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/scanned 20,5\d\d files/)
    expect(r.out).not.toMatch(/more files than discovery reads/)
    expect(r.out).toMatch(/found 6 components in 1 directory/)
    expect(config(dir).componentSources).toEqual([
      { path: "packages/ui/src/components", type: "directory", source: "discovered", status: "approved" }
    ])
  }, 120_000)

  function config(dir: string) {
    return JSON.parse(readFileSync(path.join(dir, "invariant.config.json"), "utf8")) as {
      componentSources?: Array<Record<string, string>>
    }
  }
})

describe("setup in a design system repository: publishing the contract", () => {
  it("adds a prepack script, and says what apps do next", async () => {
    const dir = project()
    writeMeta(dir, { files: ["src"] })
    const r = await cli(dir, ["setup", "--yes", "--as", "ana", "--no-ci"])
    expect(r.out).toMatch(/publish {4}@acme\/ui: added "invariant" to files and added a prepack script/)
    const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"))
    expect(pkg.files).toEqual(["src", "invariant"])
    expect(pkg.scripts.prepack).toBe(`npx @invariant-ui/cli@${VERSION} compile`)
    expect(readFileSync(path.join(dir, "package.json"), "utf8").endsWith("\n")).toBe(false)
  })

  it("is idempotent, and leaves an existing prepack alone", async () => {
    const dir = project()
    writeMeta(dir, { files: ["invariant"], scripts: { prepack: "tsc" } })
    const r = await cli(dir, ["setup", "--yes", "--as", "ana", "--no-ci"])
    expect(r.out).not.toMatch(/publish {4}/)
    expect(JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")).scripts.prepack).toBe("tsc")
  })

  it("skips a private package, and --no-publish", async () => {
    const dir = project()
    writeMeta(dir, { private: true })
    const r = await cli(dir, ["setup", "--yes", "--as", "ana", "--no-ci"])
    expect(r.out).toMatch(/not wiring publishing: @acme\/ui is private/)
    expect(JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")).scripts).toBeUndefined()
    const other = project()
    writeMeta(other, {})
    await cli(other, ["setup", "--yes", "--as", "ana", "--no-ci", "--no-publish"])
    expect(JSON.parse(readFileSync(path.join(other, "package.json"), "utf8")).scripts).toBeUndefined()
  })

  it("warns when the folder is ignored, since it would not be published", async () => {
    const dir = project()
    writeMeta(dir, {})
    writeFileSync(path.join(dir, ".npmignore"), "invariant/\n")
    const r = await cli(dir, ["setup", "--yes", "--as", "ana", "--no-ci"])
    expect(r.out).toMatch(/Warning: \.npmignore ignores invariant\//)
  })

  it("in a monorepo, compiles from the root and exports into the package", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "invariant-setup-"))
    made.push(dir)
    mkdirSync(path.join(dir, "packages"), { recursive: true })
    cpSync(path.join(root, "fixtures/storybook/acme-ui"), path.join(dir, "packages/ui"), {
      recursive: true,
      filter: (s) => !s.includes("storybook-static")
    })
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "mono", private: true, workspaces: ["packages/*"] })
    )
    writeMeta(path.join(dir, "packages/ui"), { files: ["src"] })
    const r = await cli(dir, ["setup", "--yes", "--as", "ana", "--no-ci"])
    expect(r.code).toBe(0)
    const pkg = JSON.parse(readFileSync(path.join(dir, "packages/ui/package.json"), "utf8"))
    expect(pkg.scripts.prepack).toBe(
      `npx @invariant-ui/cli@${VERSION} compile --cwd ../.. && npx @invariant-ui/cli@${VERSION} export --to packages/ui/invariant --force --cwd ../..`
    )
    expect(pkg.files).toContain("invariant")
  })
})

describe("the publishing wiring actually works", () => {
  const main = path.join(root, "apps/cli/dist/main.js")
  const runPrepack = (dir: string, cmd: string) =>
    execSync(cmd.replaceAll(`npx @invariant-ui/cli@${VERSION}`, `node ${main}`), { cwd: dir, stdio: "pipe" })
  const tarball = (dir: string): string[] =>
    (
      JSON.parse(
        execSync("npm pack --dry-run --json --ignore-scripts", { cwd: dir, stdio: "pipe" }).toString()
      ) as Array<{
        files: Array<{ path: string }>
      }>
    )[0]?.files.map((f) => f.path) ?? []

  it("a single package: the compiled contract is in the tarball after prepack", async () => {
    const dir = project()
    writeMeta(dir, { files: ["src"] })
    await cli(dir, ["setup", "--yes", "--as", "ana", "--no-ci"])
    rmSync(path.join(dir, "invariant"), { recursive: true })
    const prepack = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")).scripts.prepack as string
    runPrepack(dir, prepack)
    const files = tarball(dir)
    expect(files).toContain("invariant/invariant.contract.json")
    expect(files).toContain("invariant/invariant.evidence.json")
  }, 60_000)

  it("a monorepo package: prepack compiles at the root and exports into the package folder", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "invariant-setup-"))
    made.push(dir)
    cpSync(path.join(root, "fixtures/storybook/acme-ui"), path.join(dir, "packages/ui"), {
      recursive: true,
      filter: (s) => !s.includes("storybook-static")
    })
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "mono", private: true, workspaces: ["packages/*"] })
    )
    writeMeta(path.join(dir, "packages/ui"), { files: ["src"] })
    await cli(dir, ["setup", "--yes", "--as", "ana", "--no-ci"])
    const pkgDir = path.join(dir, "packages/ui")
    const prepack = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8")).scripts
      .prepack as string
    runPrepack(pkgDir, prepack)
    expect(existsSync(path.join(pkgDir, "invariant/invariant.contract.json"))).toBe(true)
    expect(tarball(pkgDir)).toContain("invariant/invariant.contract.json")
  }, 60_000)
})

describe("setup: GitHub Action", () => {
  const wf = ".github/workflows/invariant.yml"

  it("writes a workflow that checks every pull request commit, pinned to this version", async () => {
    const dir = project()
    const r = await cli(dir, ["setup", "--yes", "--as", "ana", "--ci"])
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/CI {9}wrote \.github\/workflows\/invariant\.yml/)
    expect(r.out).not.toMatch(/Add this to CI/)
    const yaml = readFileSync(path.join(dir, wf), "utf8")
    expect(yaml).toMatch(/pull_request:\n\s+types: \[opened, synchronize, reopened\]/)
    expect(yaml).toContain(`npx @invariant-ui/cli@${VERSION} verify --fresh`)
    expect(yaml).toContain(`npx @invariant-ui/cli@${VERSION} validate 'app' --format github`)
    expect(yaml).toMatch(/permissions:\n\s+contents: read/)
    expect(yaml).not.toMatch(/secrets\.|pull_request_target|write/)
    expect(yaml).not.toContain("\t")
  })

  it("is part of the one plan in a git project", async () => {
    const dir = project()
    mkdirSync(path.join(dir, ".git"))
    const r = await cli(dir, ["setup", "--as", "ana"], [...REVIEW, "y"])
    expect(r.asked).toHaveLength(7)
    expect(r.out).toContain(`add ${wf}, which checks every pull request commit`)
    expect(existsSync(path.join(dir, wf))).toBe(true)
  })

  it("can be declined in the step-by-step mode", async () => {
    const dir = project()
    mkdirSync(path.join(dir, ".git"))
    // c, contract yes, patterns all, approve yes, rules yes, baseline yes, publish yes, CI no (CI is always last).
    const r = await cli(dir, ["setup", "--as", "ana"], [...REVIEW, "c", "y", "", "y", "y", "y", "y", "n"])
    expect(r.asked.some((q) => /GitHub Action/.test(q))).toBe(true)
    expect(existsSync(path.join(dir, wf))).toBe(false)
    expect(r.out).toMatch(/Add this to CI/)
  })

  it("is not offered outside a git project, or with --no-ci", async () => {
    const plain = project()
    const a = await cli(plain, ["setup", "--yes", "--as", "ana"])
    expect(existsSync(path.join(plain, ".github"))).toBe(false)
    expect(a.out).toMatch(/Add this to CI/)
    const git = project()
    mkdirSync(path.join(git, ".git"))
    const b = await cli(git, ["setup", "--yes", "--as", "ana", "--no-ci"])
    expect(existsSync(path.join(git, wf))).toBe(false)
    expect(b.out).not.toMatch(/GitHub Action/)
  })

  it("leaves an existing workflow alone", async () => {
    const dir = project()
    mkdirSync(path.join(dir, ".github/workflows"), { recursive: true })
    writeFileSync(path.join(dir, wf), "name: mine\n")
    const r = await cli(dir, ["setup", "--yes", "--as", "ana", "--ci"])
    expect(r.out).toMatch(/already exists, so it will be left alone/)
    expect(readFileSync(path.join(dir, wf), "utf8")).toBe("name: mine\n")
  })

  it("quotes the paths it checks", async () => {
    const { workflowYaml } = await import("../apps/cli/src/workflow.ts")
    expect(workflowYaml(["src", "apps/web's"])).toContain("validate 'src' 'apps/web''s' --format github")
    expect(workflowYaml([])).toContain("validate 'src' --format github")
  })
})

describe("validate baseline", () => {
  it("hides existing violations, still fails on new ones, and can show everything", async () => {
    const dir = project()
    await cli(dir, ["init"])
    await cli(dir, ["compile"])
    const file = path.join(dir, "app/pages/Old.tsx")
    writeFileSync(file, 'import { Card } from "@acme/ui"\nexport const Old = () => <Card tone="loud" />\n')
    expect((await cli(dir, ["validate", "app/pages", "--fail-on", "warning"])).code).toBe(1)

    const w = await cli(dir, ["validate", "app/pages", "--update-baseline"])
    expect(w.code).toBe(0)
    expect(w.out).toMatch(/now hidden/)
    const clean = await cli(dir, ["validate", "app/pages", "--fail-on", "warning"])
    expect(clean.code).toBe(0)
    expect(clean.err).toMatch(/hidden by invariant\.baseline\.json/)

    // Moving the code does not bring it back.
    writeFileSync(
      file,
      'import { Card } from "@acme/ui"\n\n\nexport const Old = () => <Card tone="loud" />\n'
    )
    expect((await cli(dir, ["validate", "app/pages", "--fail-on", "warning"])).code).toBe(0)

    // A second one is new and fails.
    writeFileSync(
      file,
      'import { Card } from "@acme/ui"\nexport const Old = () => <><Card tone="loud" /><Card tone="loud" /></>\n'
    )
    expect((await cli(dir, ["validate", "app/pages", "--fail-on", "warning"])).code).toBe(1)
    expect((await cli(dir, ["validate", "app/pages", "--no-baseline", "--fail-on", "warning"])).code).toBe(1)
  })
})
