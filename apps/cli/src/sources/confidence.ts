import type { DirectoryCandidate, Thresholds } from "./discover.js"
import type { Confidence, ProjectRecognition } from "./recognize.js"

export interface Assessment {
  level: Confidence
  /** Why the level is not high, in words. Empty when it is high. */
  reasons: string[]
}

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 }

/**
 * How sure the scan is that it found the design system's components. It is the confidence of the strongest directory it
 * would recommend, and low when it would recommend none, so a person is never asked to confirm a guess it cannot back.
 */
export function assess(input: {
  candidates: readonly DirectoryCandidate[]
  recognition: ProjectRecognition
  thresholds: Thresholds
}): Assessment {
  const { candidates, recognition, thresholds } = input
  if (candidates.length === 0) {
    const ui = recognition.packages.filter((p) => p.frameworks.length > 0).length
    return {
      level: "low",
      reasons: [
        ui === 0
          ? "no package here declares React, Vue or Angular"
          : `no React, Vue or Angular components were found in the ${ui} package${ui === 1 ? "" : "s"} that use a UI framework`
      ]
    }
  }
  const best = [...candidates].sort((a, b) => b.classification.score - a.classification.score)[0]
  const recommended = candidates.filter((c) => c.recommendation === "recommended")
  if (recommended.length === 0 && best)
    return {
      level: "low",
      reasons: [
        `no directory scored high enough to recommend (the best, ${best.path}, scored ${best.classification.score} of the ${thresholds.medium} needed)`
      ]
    }
  const top = recommended.reduce((a, b) =>
    RANK[b.classification.confidence] > RANK[a.classification.confidence] ? b : a
  )
  const level = top.classification.confidence
  return {
    level,
    reasons:
      level === "high"
        ? []
        : [`the strongest directory, ${top.path}, is ${level} confidence (${top.classification.score}/100)`]
  }
}
