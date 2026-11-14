import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { bundleSnippet } from "./preview-bundle.js"

const made: string[] = []
afterAll(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true })
})

/** A project with a design system package in node_modules, as a customer's app has. */
function project(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "invariant-bundle-"))
  made.push(dir)
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    writeFileSync(path.join(dir, rel), text)
  }
  return dir
}

describe("bundleSnippet", () => {
  it("bundles the snippet with the customer's own package and stylesheet, and exposes it", async () => {
    const dir = project({
      "node_modules/@acme/ui/package.json": JSON.stringify({ name: "@acme/ui", main: "index.js" }),
      "node_modules/@acme/ui/index.js": 'export const Button = () => "acme-button-code"',
      "node_modules/@acme/tokens/tokens.css": ":root { --color-brand: #0057ff; }",
      "app/Settings.ts": 'import { Button } from "@acme/ui"\nexport const Page = Button',
      "tokens.css": "@import '@acme/tokens/tokens.css';"
    })
    const bundle = await bundleSnippet({
      projectDir: dir,
      file: "app/Settings.ts",
      stylesheets: ["tokens.css"]
    })
    expect(bundle.js).toContain("acme-button-code")
    expect(bundle.js).toContain("__invariantPreview")
    expect(bundle.css).toContain("--color-brand: #0057ff")
    expect(existsSync(path.join(dir, ".invariant"))).toBe(false)
  })

  it("includes a wrapper module when one is configured", async () => {
    const dir = project({
      "app/Settings.ts": "export const Page = 1",
      "app/providers.ts": 'export const Theme = "provider-code"'
    })
    const bundle = await bundleSnippet({
      projectDir: dir,
      file: "app/Settings.ts",
      stylesheets: [],
      wrapper: "app/providers.ts"
    })
    expect(bundle.js).toContain("provider-code")
    expect(bundle.js).toContain("wrapper")
  })

  it("says what does not bundle, with the location, instead of a raw esbuild error", async () => {
    const dir = project({
      "app/Settings.ts": 'import { Missing } from "@acme/not-installed"\nexport const P = Missing'
    })
    await expect(
      bundleSnippet({ projectDir: dir, file: "app/Settings.ts", stylesheets: [] })
    ).rejects.toThrow(/the snippet does not bundle: .*not-installed/)
  })
})
