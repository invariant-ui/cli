import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { configSchema, validateConfig } from "../config.js"
import {
  applyDecisions,
  type ComponentSource,
  inScope,
  mergeDecisions,
  normalizeSources
} from "./approval.js"
import { analyzePath, discoverSources } from "./discover.js"
import { analyzeProject, discoverFor } from "./plan.js"
import { recognizeProject } from "./recognize.js"

const made: string[] = []
afterAll(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true })
})
function project(files: Record<string, string | object>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "invariant-src-"))
  made.push(dir)
  for (const [file, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    writeFileSync(path.join(dir, file), typeof body === "string" ? body : JSON.stringify(body))
  }
  return dir
}
const react = (name: string, extra = ""): string =>
  `${extra}\nexport function ${name}(props: { label: string }) { return <div aria-label={props.label}>{props.label}</div> }\n`
const lib = (name = "@acme/ui", extra: object = {}) => ({
  name,
  version: "1.0.0",
  description: "The component library",
  main: "src/index.ts",
  scripts: { build: "tsc" },
  peerDependencies: { react: "^18" },
  ...extra
})

describe("project recognition", () => {
  it("recognizes a standalone component library, and an application", async () => {
    const l = await recognizeProject(
      project({
        "package.json": lib(),
        "src/index.ts": 'export * from "./components/Button"',
        "src/components/Button.tsx": react("Button")
      })
    )
    expect(l.kind).toBe("component-library")
    expect(l.packages[0]).toMatchObject({ role: "design-system", frameworks: ["react"] })
    expect(l.packages[0]?.evidence.every((e) => e.detail !== "")).toBe(true)

    const a = await recognizeProject(
      project({
        "package.json": {
          name: "web",
          private: true,
          scripts: { dev: "vite" },
          dependencies: { react: "^18" }
        },
        "src/pages/Home.tsx": react("Home")
      })
    )
    expect(a.kind).toBe("application")
    expect(a.packages[0]?.role).toBe("application")
  })

  it("tells the roles of packages in a monorepo, and finds several libraries", async () => {
    const r = await recognizeProject(
      project({
        "package.json": { name: "root", private: true, workspaces: ["packages/*", "apps/*"] },
        "packages/ui/package.json": lib("@acme/ui"),
        "packages/ui/src/index.ts": 'export * from "./components/Button"',
        "packages/ui/src/components/Button.tsx": react("Button"),
        "packages/forms/package.json": lib("@acme/forms-ui"),
        "packages/forms/src/index.ts": 'export * from "./Field"',
        "packages/forms/src/Field.tsx": react("Field"),
        "packages/tokens/package.json": { name: "@acme/tokens", version: "1.0.0" },
        "packages/tokens/src/tokens.css": ":root { --a: 1 }",
        "apps/web/package.json": {
          name: "web",
          private: true,
          scripts: { dev: "vite" },
          dependencies: { "@acme/ui": "*", react: "^18" }
        },
        "apps/web/src/pages/Home.tsx": react("Home")
      })
    )
    expect(r.kind).toBe("monorepo")
    const role = (dir: string) => r.packages.find((p) => p.dir === dir)?.role
    expect(role("packages/ui")).toBe("design-system")
    expect(role("packages/forms")).toBe("design-system")
    expect(role("packages/tokens")).toBe("tokens")
    expect(role("apps/web")).toBe("application")
    expect(r.packages.find((p) => p.dir === "packages/ui")?.consumers).toEqual(["web"])
  })

  it("keeps a role the configuration sets", async () => {
    const dir = project({
      "package.json": { name: "web", private: true, scripts: { dev: "vite" } },
      "src/A.tsx": react("A")
    })
    const r = await recognizeProject(dir, [{ path: ".", role: "design-system" }])
    expect(r.packages[0]).toMatchObject({ role: "design-system", confidence: "high" })
  })
})

describe("discovery in a component library", () => {
  const files = {
    "package.json": lib(),
    "src/index.ts": 'export * from "./components/Button/Button"\nexport * from "./primitives/Icon"',
    "src/components/Button/Button.tsx": react("Button"),
    "src/components/Button/Button.stories.tsx": "export default {}",
    "src/components/Dialog/Dialog.tsx": react("Dialog"),
    "src/components/Dialog/Dialog.test.tsx": "",
    "src/primitives/Icon.tsx": react("Icon"),
    "src/internal/Tooltip.tsx": react("Tooltip"),
    "src/examples/Demo.tsx": react("Demo"),
    "src/util/format.ts": "export const f = () => 1"
  }
  it("groups component-per-folder into one directory, separates examples, and needs no consumers", async () => {
    const dir = project(files)
    const a = await analyzeProject(dir)
    const { candidates } = await discoverFor(dir, a)
    const byPath = Object.fromEntries(candidates.map((c) => [c.path, c]))
    expect(Object.keys(byPath)).toEqual(["src/components", "src/examples", "src/internal", "src/primitives"])
    expect(byPath["src/components"]).toMatchObject({
      componentCount: 2,
      strategy: "component-library",
      recommendation: "recommended"
    })
    expect(
      byPath["src/components"]?.classification.evidence.some((e) => e.signal === "design-system-package")
    ).toBe(true)
    expect(byPath["src/examples"]?.recommendation).toBe("potential")
    expect(byPath["src/examples"]?.classification.category).toBe("examples")
    expect(byPath["src/primitives"]?.recommendation).toBe("recommended")
    expect(byPath["src/components"]?.components.map((c) => [c.name, c.stories, c.tests])).toEqual([
      ["Button", true, false],
      ["Dialog", false, true]
    ])
    // Nothing in a library is penalized for having no importers.
    expect(candidates.every((c) => c.classification.evidence.every((e) => e.signal !== "no-consumers"))).toBe(
      true
    )
  })
  it("finds the same thing every time", async () => {
    const dir = project(files)
    const a = await analyzeProject(dir)
    expect(JSON.stringify(await discoverFor(dir, a))).toBe(JSON.stringify(await discoverFor(dir, a)))
  })
  it("merges sibling directories under a shared components folder, and flat files into one directory", async () => {
    const dir = project({
      "package.json": lib(),
      "src/components/primitives/Icon.tsx": react("Icon"),
      "src/components/composites/Select.tsx": react("Select")
    })
    const a = await analyzeProject(dir)
    expect((await discoverFor(dir, a)).candidates.map((c) => c.path)).toEqual(["src/components"])
    const flat = project({
      "package.json": lib(),
      "src/Button.tsx": react("Button"),
      "src/Dialog.tsx": react("Dialog")
    })
    expect(
      (await discoverFor(flat, await analyzeProject(flat))).candidates.map((c) => [c.path, c.componentCount])
    ).toEqual([["src", 2]])
  })
  it("ignores folder names above the package, so a library kept under demo/ or apps/ is not an example", async () => {
    const dir = project({
      "demo/package.json": { name: "root", private: true, workspaces: ["packages/*"] },
      "demo/packages/ui/package.json": lib(),
      "demo/packages/ui/src/index.ts": 'export * from "./Button"',
      "demo/packages/ui/src/Button.tsx": react("Button")
    })
    const [c] = (await discoverFor(dir, await analyzeProject(dir))).candidates
    expect(c?.path).toBe("demo/packages/ui/src")
    expect(c?.recommendation).toBe("recommended")
    expect(
      c?.classification.evidence.some((e) => e.signal === "examples" || e.signal === "feature-directory")
    ).toBe(false)
  })
  it("finds Angular and Vue components", async () => {
    const ng = project({
      "package.json": lib("@acme/ng-ui", { peerDependencies: { "@angular/core": "^18" } }),
      "src/lib/button/button.component.ts":
        '@Component({ selector: "x-button", template: "" })\nexport class ButtonComponent { @Input() label = "" }',
      "src/lib/dialog/dialog.component.ts":
        '@Component({ selector: "x-dialog", template: "" })\nexport class DialogComponent {}'
    })
    const found = (await discoverFor(ng, await analyzeProject(ng))).candidates
    expect(found.map((c) => [c.path, c.frameworks, c.componentCount])).toEqual([["src/lib", ["angular"], 2]])
    const vue = project({
      "package.json": lib("@acme/vue-ui", { peerDependencies: { vue: "^3" } }),
      "src/components/BaseButton.vue":
        '<script setup lang="ts">defineProps<{ a: string }>()</script><template><button /></template>'
    })
    expect((await discoverFor(vue, await analyzeProject(vue))).candidates[0]).toMatchObject({
      frameworks: ["vue"],
      path: "src/components"
    })
  })
})

describe("discovery in an application", () => {
  const importer = (n: string): string =>
    `import { Button } from "../../components/Button"\nimport { Card } from "../../components/Card"\nexport function Page${n}() { return <Card label="x"><Button label="x" /></Card> }\n`
  const files = {
    "package.json": { name: "web", private: true, scripts: { dev: "vite" }, dependencies: { react: "^18" } },
    "src/components/Button.tsx": react("Button"),
    "src/components/Card.tsx": react("Card"),
    "src/features/accounts/Page.tsx": importer("A"),
    "src/features/cards/Page.tsx": importer("B"),
    "src/features/transfers/Page.tsx": importer("C"),
    "src/features/transfers/TransferApprovalCard.tsx":
      'import { useQuery } from "@tanstack/query"\nimport { getTransfer } from "../../services/transfers"\nimport { Transfer } from "../../models/transfer"\n' +
      "export function TransferApprovalCard() { useQuery(); return <div /> }\n",
    "src/services/transfers.ts": "export const getTransfer = () => 1",
    "src/models/transfer.ts": "export type Transfer = {}"
  }
  it("recommends the shared directory by cross-feature use, and not feature-specific ones", async () => {
    const dir = project(files)
    const a = await analyzeProject(dir)
    const { candidates } = await discoverFor(dir, a)
    const shared = candidates.find((c) => c.path === "src/components")
    expect(shared?.strategy).toBe("application")
    expect(shared?.recommendation).toBe("recommended")
    expect(shared?.components.find((c) => c.name === "Button")?.featureAreas).toBe(3)
    expect(shared?.classification.evidence.some((e) => e.signal === "cross-feature-use")).toBe(true)
    const transfers = candidates.find((c) => c.path === "src/features/transfers")
    expect(transfers?.recommendation).not.toBe("recommended")
    expect(transfers?.classification.evidence.map((e) => e.signal)).toEqual(
      expect.arrayContaining(["application-services", "domain-models", "business-api", "feature-directory"])
    )
  })
  it("holds a score below high confidence without two kinds of independent evidence", async () => {
    const dir = project({
      "package.json": { name: "web", private: true },
      "src/components/A.tsx": react("A")
    })
    const [c] = (await discoverFor(dir, await analyzeProject(dir))).candidates
    expect(c?.classification.confidence).not.toBe("high")
  })
  it("reads a path the person adds, a directory or one file, and refuses one with no components", async () => {
    const dir = project(files)
    const rec = (await analyzeProject(dir)).recognition
    expect((await analyzePath(dir, rec, "src/components"))?.candidate.componentCount).toBe(2)
    expect(
      (await analyzePath(dir, rec, "src/components/Card.tsx"))?.candidate.components.map((c) => c.name)
    ).toEqual(["Card"])
    expect(await analyzePath(dir, rec, "src/services")).toBeUndefined()
  })
  it("respects .gitignore and never reads node_modules", async () => {
    const dir = project({
      ...files,
      ".gitignore": "generated/\n",
      "generated/Gen.tsx": react("Gen"),
      "node_modules/pkg/Dep.tsx": react("Dep")
    })
    const names = (await discoverFor(dir, await analyzeProject(dir))).candidates.flatMap((c) =>
      c.components.map((x) => x.name)
    )
    expect(names).not.toContain("Gen")
    expect(names).not.toContain("Dep")
  })
})

describe("approved sources", () => {
  const src = (
    p: string,
    status: ComponentSource["status"],
    source: ComponentSource["source"] = "discovered",
    type: ComponentSource["type"] = "directory"
  ): ComponentSource => ({ path: p, type, source, status })
  it("normalizes: one entry per path, sorted, nothing redundant", () => {
    expect(
      normalizeSources([
        src("b", "approved"),
        src("a", "approved"),
        src("a/x", "approved"),
        src("b", "excluded"),
        src("a/y", "pending")
      ])
    ).toEqual([src("a", "approved"), src("b", "excluded")])
    expect(
      normalizeSources([
        src("a", "approved"),
        src("a/x", "excluded"),
        src("a/x/f.tsx", "approved", "user", "file")
      ]).map((s) => s.path)
    ).toEqual(["a", "a/x", "a/x/f.tsx"])
  })
  it("keeps what the person added inside an approved directory, and drops a redundant discovered entry", () => {
    expect(
      normalizeSources([
        src("a", "approved"),
        src("a/f.tsx", "approved", "user", "file"),
        src("a/g", "approved")
      ]).map((s) => s.path)
    ).toEqual(["a", "a/f.tsx"])
  })
  it("scope: the most specific decision wins", () => {
    const s = [
      src("lib", "approved"),
      src("lib/legacy", "excluded"),
      src("lib/legacy/Keep.tsx", "approved", "user", "file")
    ]
    expect(inScope("lib/Button.tsx", s)).toBe(true)
    expect(inScope("lib/legacy/Old.tsx", s)).toBe(false)
    expect(inScope("lib/legacy/Keep.tsx", s)).toBe(true)
    expect(inScope("other/X.tsx", s)).toBe(false)
    expect(inScope("anything.tsx", [])).toBe(true)
  })
  it("a rerun never approves what was excluded, and never drops what the person added", () => {
    const prior = [src("lib/examples", "excluded"), src("lib/Brand.tsx", "approved", "user", "file")]
    const next = mergeDecisions(prior, [src("lib/examples", "pending"), src("lib/components", "approved")])
    expect(next).toEqual([
      src("lib/Brand.tsx", "approved", "user", "file"),
      src("lib/components", "approved"),
      src("lib/examples", "excluded")
    ])
    // A person approving it in the review is a decision.
    expect(
      mergeDecisions(prior, [src("lib/examples", "approved")]).find((s) => s.path === "lib/examples")?.status
    ).toBe("approved")
  })
  it("writes decisions into the config and keeps everything else in it", async () => {
    const dir = project({ "package.json": lib(), "src/Button.tsx": react("Button") })
    const a = await analyzeProject(dir)
    const out = await discoverSources(dir, a.recognition, a.targets)
    const base = validateConfig({
      name: "DS",
      sources: [{ id: "sb", type: "storybook" }],
      validation: { failOn: "never" },
      enforcement: { hooks: "warn" }
    })
    const config = applyDecisions(base, {
      decisions: [src("src", "approved")],
      recognition: a.recognition,
      candidates: out.candidates,
      packages: a.targets
    })
    expect(config.validation).toEqual({ failOn: "never" })
    expect(config.enforcement).toEqual({ hooks: "warn" })
    expect(config.sources.map((s) => s.type)).toEqual(["storybook", "react"])
    expect(config.componentSources).toEqual([src("src", "approved")])
    expect(config.discovery).toMatchObject({
      mode: "component-library",
      packages: [{ name: "@acme/ui", path: ".", role: "design-system" }]
    })
    expect(configSchema.safeParse(config).success).toBe(true)
  })
  it("rejects duplicate paths, bad paths and inverted thresholds", () => {
    const ok = { name: "DS", sources: [] }
    expect(() =>
      validateConfig({ ...ok, componentSources: [src("a", "approved"), src("a/", "excluded")] })
    ).toThrow(/more than once/)
    expect(() => validateConfig({ ...ok, componentSources: [src("../x", "approved")] })).toThrow(
      /relative path/
    )
    expect(() => validateConfig({ ...ok, discovery: { thresholds: { high: 40, medium: 60 } } })).toThrow(
      /lower than high/
    )
  })
})
