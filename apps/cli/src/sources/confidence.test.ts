import { describe, expect, it } from "vitest"
import { assess } from "./confidence.js"
import { DEFAULT_THRESHOLDS, type DirectoryCandidate } from "./discover.js"
import type { Confidence, PackageRole, ProjectRecognition } from "./recognize.js"

const cand = (
  path: string,
  score: number,
  confidence: Confidence,
  recommendation: DirectoryCandidate["recommendation"]
): DirectoryCandidate => ({
  path,
  packageDir: ".",
  strategy: "component-library",
  components: [],
  componentCount: 3,
  frameworks: ["react"],
  classification: { confidence, score, evidence: [] },
  recommendation
})
const pkg = (frameworks: string[]): PackageRole => ({
  dir: ".",
  role: "unknown",
  score: 0,
  confidence: "low",
  frameworks,
  consumers: [],
  evidence: []
})
const recognition = (...packages: PackageRole[]): ProjectRecognition =>
  ({ kind: "monorepo", monorepo: true, packages }) as unknown as ProjectRecognition
const run = (candidates: DirectoryCandidate[], r = recognition(pkg(["react"]))) =>
  assess({ candidates, recognition: r, thresholds: DEFAULT_THRESHOLDS })

describe("how sure the scan is", () => {
  it("is low, and says why, when it found no components", () => {
    expect(run([], recognition(pkg(["react"])))).toEqual({
      level: "low",
      reasons: ["no React, Vue or Angular components were found in the 1 package that use a UI framework"]
    })
    expect(run([], recognition(pkg([])))).toEqual({
      level: "low",
      reasons: ["no package here declares React, Vue or Angular"]
    })
  })

  it("is low when no directory would be recommended, naming the best one", () => {
    const r = run([cand("a", 20, "low", "not-recommended"), cand("src/widgets", 38, "low", "potential")])
    expect(r.level).toBe("low")
    expect(r.reasons[0]).toBe(
      "no directory scored high enough to recommend (the best, src/widgets, scored 38 of the 50 needed)"
    )
  })

  it("is the confidence of the strongest directory it would recommend", () => {
    expect(run([cand("a", 90, "high", "recommended"), cand("b", 55, "medium", "recommended")])).toEqual({
      level: "high",
      reasons: []
    })
    const medium = run([cand("a", 60, "medium", "recommended"), cand("b", 20, "low", "not-recommended")])
    expect(medium.level).toBe("medium")
    expect(medium.reasons[0]).toContain("the strongest directory, a, is medium confidence (60/100)")
  })

  it("ignores a high-looking directory that is not recommended", () => {
    expect(run([cand("examples", 85, "high", "potential")]).level).toBe("low")
  })
})
