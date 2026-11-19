import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { findApps, inside } from "./setup-discovery.js"

const made: string[] = []
afterAll(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true })
})
function write(root: string, file: string, text = ""): void {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
  writeFileSync(path.join(root, file), text)
}
function monorepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "invariant-sd-"))
  made.push(dir)
  write(
    dir,
    "package.json",
    JSON.stringify({ name: "root", private: true, workspaces: ["packages/*", "apps/*"] })
  )
  write(dir, "packages/ui/package.json", JSON.stringify({ name: "@x/ui", version: "1.0.0" }))
  write(dir, "packages/ui/src/Button.tsx", "export const Button = () => null\n")
  write(dir, "packages/ui/src/Button.stories.tsx", "export default {}\n")
  write(
    dir,
    "apps/web/package.json",
    JSON.stringify({ name: "web", dependencies: { "@x/ui": "workspace:*" } })
  )
  write(dir, "apps/docs/package.json", JSON.stringify({ name: "docs" }))
  return dir
}

describe("setup discovery", () => {
  it("finds the apps that depend on a confirmed component package", async () => {
    expect(await findApps(monorepo(), ["packages/ui"])).toEqual(["apps/web"])
    expect(await findApps(monorepo(), ["packages/other"])).toEqual([])
  })
  it("keeps paths inside the project", () => {
    expect(inside("/p", "a/b")).toBe("a/b")
    expect(inside("/p", "../x")).toBeUndefined()
    expect(inside("/p", "/etc")).toBeUndefined()
  })
})
