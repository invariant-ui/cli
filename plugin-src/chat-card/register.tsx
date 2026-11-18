import type { Register } from "claude-code"
import { atom, read, update } from "claude-code"

import type { Tally } from "../types"

const tally = atom({ plugin: "invariant", key: "tally" } as const, { checks: 0, failed: 0 } as Tally)

const PREFIX = "mcp__plugin_invariant_invariant__"

// shortcut: shows the first string argument as the subject; a per-tool summary comes later
const subject = (input: unknown): string => {
  if (typeof input !== "object" || input === null) return ""
  const first = Object.values(input).find((v) => typeof v === "string")
  return typeof first === "string" ? first.slice(0, 60) : ""
}

export const register: Register = (on) => {
  on("prompt.submit", async ($, e, next) => {
    await update($, tally, () => ({ checks: 0, failed: 0 }))
    return next(e)
  })

  on("tool.call", async ($, e, next) => {
    if (!e.tool.startsWith(PREFIX)) return next(e)
    const result = await next(e)
    await update($, tally, (t) => ({ checks: t.checks + 1, failed: t.failed + (result.isError ? 1 : 0) }))
    return result
  })

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const t = await read($, tally)
    if (t.checks === 0) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text bold>Invariant </Text>
        <Text dimColor>
          this turn: {t.checks} contract check{t.checks === 1 ? "" : "s"}
          {t.failed ? `, ${t.failed} failed` : ""}
        </Text>
      </Box>
    )
  })

  on("ui.render", { component: "ToolGroup" }, async ($, e, next) => {
    const calls = e.props.calls
    // shortcut: only a group made wholly of Invariant calls is replaced; mixed groups keep the engine's line
    if (e.props.isExpanded || calls.length === 0 || !calls.every((c) => c.tool.startsWith(PREFIX)))
      return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const running = calls.some((c) => c.isRunning)
    const failed = calls.filter((c) => c.isErrored).length

    return (
      <Box borderStyle="round" flexDirection="column" width="100%">
        <Text bold>
          Invariant · {calls.length} contract check{calls.length === 1 ? "" : "s"}
          {running ? " …" : failed ? ` (${failed} failed)` : " ✓"}
        </Text>
        {calls.map((c, i) => (
          <Text key={String(i)} dimColor>
            {c.tool.slice(PREFIX.length)} {subject(c.input)}
          </Text>
        ))}
      </Box>
    )
  })

  on("ui.render", { component: "ToolUse" }, async ($, e, next) => {
    if (!e.props.tool.startsWith(PREFIX)) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const name = e.props.tool.slice(PREFIX.length)
    const state = e.props.isRunning ? "checking…" : e.props.isErrored ? "failed" : "✓"

    return (
      <Box borderStyle="round">
        <Text bold>Invariant </Text>
        <Text>
          {name} {subject(e.props.input)} {state}
        </Text>
        {await next(e)}
      </Box>
    )
  })
}
