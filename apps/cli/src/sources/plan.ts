import type { InvariantConfig } from "../config.js"
import { DEFAULT_THRESHOLDS, type DirectoryCandidate, discoverSources, type Thresholds } from "./discover.js"
import { type PackageRole, type ProjectRecognition, recognizeProject } from "./recognize.js"
import { type Scan, scan } from "./scan.js"

export interface Analysis {
  recognition: ProjectRecognition
  /** The packages whose components are discovered: design-system packages, else the applications, else any with a UI framework. */
  targets: PackageRole[]
  thresholds: Thresholds
  /** The one walk of the project that every later step reads from, so the folders are read once. */
  scan: Scan
}

/** Which packages to look in. A design-system package is the source; without one, the applications that hold components. */
export function chooseTargets(recognition: ProjectRecognition): PackageRole[] {
  const ui = recognition.packages.filter((r) => r.frameworks.length > 0)
  const ds = recognition.packages.filter((r) => r.role === "design-system")
  if (ds.length > 0) return ds
  const apps = ui.filter((r) => r.role === "application")
  return apps.length > 0 ? apps : ui
}

export async function analyzeProject(
  cwd: string,
  config?: InvariantConfig,
  onProgress?: Parameters<typeof scan>[2]
): Promise<Analysis> {
  const walked = await scan(cwd, ".", onProgress)
  const recognition = await recognizeProject(
    cwd,
    (config?.discovery?.packages ?? []).map((p) => ({ path: p.path, role: p.role })),
    walked
  )
  return {
    recognition,
    targets: chooseTargets(recognition),
    thresholds: config?.discovery?.thresholds ?? DEFAULT_THRESHOLDS,
    scan: walked
  }
}

export async function discoverFor(
  cwd: string,
  a: Analysis,
  targets: readonly PackageRole[] = a.targets
): Promise<{ candidates: DirectoryCandidate[]; diagnostics: string[] }> {
  const out = await discoverSources(cwd, a.recognition, targets, a.thresholds, a.scan)
  return { candidates: out.candidates, diagnostics: out.diagnostics }
}
