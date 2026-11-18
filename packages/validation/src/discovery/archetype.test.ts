import { describe, expect, it } from "vitest"
import { classify } from "./archetype.js"

const at = (...files: string[]) => ({
  suggestedName: "x",
  evidence: files.map((file) => ({ file, line: 1, column: 1, detail: "d" }))
})

describe("classify", () => {
  it("calls files under pages/ or routes/ a page, as an inferred guess with its files", () => {
    const a = classify(at("src/pages/a.tsx", "src/pages/b.tsx", "src/routes/c.tsx"))
    expect(a).toMatchObject({ category: "page", basis: "inferred", confidence: 1 })
    expect(a?.files).toHaveLength(3)
  })
  it("calls layout files a layout, and layout wins over page", () => {
    expect(classify(at("src/layouts/a.tsx", "src/layouts/b.tsx"))?.category).toBe("layout")
    expect(classify(at("app/dash/layout.tsx", "app/x/layout.tsx", "app/y/layout.tsx"))?.category).toBe(
      "layout"
    )
    expect(classify(at("src/pages/AppShell.tsx", "src/pages/Shell.tsx"))?.category).toBe("layout")
  })
  it("claims nothing without a majority or a signal", () => {
    expect(classify(at("src/a.tsx", "src/b.tsx"))).toBeUndefined()
    expect(classify(at("src/pages/a.tsx", "src/x.tsx", "src/y.tsx"))).toBeUndefined()
  })
})
