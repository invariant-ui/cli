import { describe, expect, it } from "vitest"
import { detectAngularComponents } from "./detect-file.js"

describe("detectAngularComponents", () => {
  it("finds @Component classes and whether they declare inputs", () => {
    const found = detectAngularComponents(
      "src/lib/button.component.ts",
      `import { Component, Input, input } from "@angular/core"
       @Component({ selector: "x-button", template: "" })
       export class ButtonComponent { @Input() label = "" }
       @Component({ selector: "x-i", template: "" })
       export class IconComponent { size = input(1) }
       @Component({ selector: "x-p", template: "" })
       class PlainComponent {}
       @Directive({}) export class NotOne {}`
    )
    expect(found.map((c) => [c.name, c.exported, c.typedApi])).toEqual([
      ["ButtonComponent", true, true],
      ["IconComponent", true, true],
      ["PlainComponent", false, false]
    ])
  })
})
