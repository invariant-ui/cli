import { describe, expect, it } from "vitest"
import { detectVueComponents } from "./detect-file.js"

describe("detectVueComponents", () => {
  it("treats an SFC as the component and reads defineProps", () => {
    const [c] = detectVueComponents(
      "src/BaseButton.vue",
      `<script setup lang="ts">\ndefineProps<{ label: string }>()\n</script>\n<template><button /></template>`
    )
    expect(c).toMatchObject({ name: "BaseButton", kind: "sfc", exported: true, typedApi: true })
    expect(detectVueComponents("src/Empty.vue", "<style>a{}</style>")).toEqual([])
  })
  it("finds defineComponent modules", () => {
    const found = detectVueComponents(
      "src/Thing.ts",
      `import { defineComponent } from "vue"\nexport const Thing = defineComponent({ props: { a: String } })`
    )
    expect(found.map((c) => [c.name, c.exported, c.typedApi])).toEqual([["Thing", true, true]])
  })
})
