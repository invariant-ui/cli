import { expect, test } from "claude-code/testing"

const call = (tool: string, input: unknown) => ({
  tool,
  input,
  isRunning: false,
  isErrored: false,
  isInterrupted: false
})

const group = (calls: ReturnType<typeof call>[]) =>
  ({
    plugin: "invariant",
    component: "ToolGroup",
    props: { calls, isActive: false, isExpanded: false }
  }) as const

test("a group of Invariant calls draws one card, on every surface", async ($) => {
  for (const surface of ["terminal", "desktop", "vscode", "mobile"] as const) {
    const ui = await $.ui.mount({
      ...group([
        call("mcp__plugin_invariant_invariant__get_component", { name: "Button" }),
        call("mcp__plugin_invariant_invariant__search_design_system", { query: "input" })
      ]),
      surface
    })

    expect((await ui.find({ type: "Text", text: /2 contract checks/ }))?.text).toMatch(/✓/)
    await ui.unmount()
  }
})

test("a group with another tool in it is left to the engine", async ($, on) => {
  on("ui.render", ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({
    ...group([call("mcp__plugin_invariant_invariant__get_component", {}), call("Read", {})]),
    surface: "desktop"
  })

  expect((await ui.find({ type: "Text" }))?.text).toBe("engine")
  await ui.unmount()
})
