import { describe, expect, it } from "vitest"
import { workflowYaml } from "./workflow.js"

describe("workflowYaml report steps", () => {
  it("uploads the report and links it from the run summary, even when a check failed", () => {
    const yaml = workflowYaml(["src"])
    expect(yaml).toContain("uses: actions/upload-artifact@v4")
    expect(yaml).toContain("path: 'invariant/invariant.report.html'")
    expect(yaml).toMatch(/id: report\n\s+if: always\(\)/)
    expect(yaml).toContain("steps.report.outputs.artifact-url != ''")
    expect(yaml).toContain('echo "[Invariant report]($REPORT_URL)" >> "$GITHUB_STEP_SUMMARY"')
    expect(yaml).toContain(`REPORT_URL: \${{ steps.report.outputs.artifact-url }}`)
  })

  it("uses the configured output folder, quoted", () => {
    const yaml = workflowYaml(["src"], [], "design/it's out")
    expect(yaml).toContain("path: 'design/it''s out/invariant.report.html'")
  })

  it("keeps the report step after validate", () => {
    const yaml = workflowYaml(["src"])
    expect(yaml.indexOf("validate 'src' --format github")).toBeLessThan(
      yaml.indexOf("Upload the Invariant report")
    )
  })
})
