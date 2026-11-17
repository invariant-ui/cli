import { describe, expect, it } from "vitest"
import { countBySeverity, fileLink, formatDiagnostic, paint, setColor, setLinks, table } from "./format.js"

const diag = { severity: "error", code: "X", message: "m" } as never

describe("format color", () => {
  it("is plain by default", () => {
    expect(paint("bad", "x")).toBe("x")
    expect(formatDiagnostic(diag)).toBe("error   X: m")
    expect(table(["A"], [["b"]])).toBe("A\n-\nb")
    expect(countBySeverity([])).toBe("0 errors, 0 warnings, 0 info")
  })
  it("colors when on, and keeps column alignment", () => {
    setColor(true)
    try {
      expect(paint("bad", "x")).toBe("\x1b[38;2;248;113;113mx\x1b[0m")
      const plain = (s: string): string =>
        s.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "")
      expect(plain(table(["Name", "K"], [["Button", "c"]]))).toBe("Name    K\n------  -\nButton  c")
      expect(plain(formatDiagnostic(diag))).toBe("error   X: m")
    } finally {
      setColor(false)
    }
  })
  it("links a file when on, and is the plain path otherwise", () => {
    expect(fileLink("/p/invariant.report.html", "invariant/r.html")).toBe("invariant/r.html")
    setLinks(true)
    try {
      expect(fileLink("/p/a b.html", "x")).toBe("\x1b]8;;file:///p/a%20b.html\x1b\\x\x1b]8;;\x1b\\")
    } finally {
      setLinks(false)
    }
  })
})
