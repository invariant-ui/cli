# ADR 0007: Chat cards that fit any AI tool

Status: **Proposed**. One prototype exists outside the repo (a Claude Code mod, see D4). Nothing here changes the contract.
Related: `docs/decisions/0003-agent-enforcement-hooks.md`, `docs/decisions/0004-rendered-preview.md`, `docs/specifications/agent-enforcement-v1.md`

## Context

The enforcement card (`packages/validation/src/card.ts`) is plain text. It tells the agent what to fix, and the person watching the chat may see it. The goal is for a person to see Invariant being called and used, in the chat thread of whatever AI tool they use (Claude Code, Cursor, Windsurf, and tools that do not exist yet), styled to fit that tool.

Constraints found while investigating:

- **A client draws only what it chooses to draw.** Invariant cannot style another tool's chat. It can return content the client renders, and in a few clients it can hook the renderer.
- **MCP is the only channel all target clients share.** Hooks and plugin APIs differ per client.
- **Plain text and markdown are the only output every chat is known to render.** Richer MCP content (images, MCP Apps `ui://` resources) depends on client support. Support in Cursor and Windsurf is **not verified**.
- **The model's own reply renders everywhere.** An instruction to print a receipt is a universal channel, but the model may paraphrase it.
- Claude Code mods (`ui.render` hooks) can draw a themed card on every Claude Code surface (terminal, desktop, VS Code, mobile). They work in no other client.

## Decision (proposed)

**D1. The card is data first.** A card is a structured object (what was checked, per-check status, findings, fixes, next step), produced by deterministic code from the compiled contract and validator results. Every rendering below is a renderer over that object. A renderer adds no facts and drops none. This keeps the card inside the existing principle that nothing is fabricated or silently dropped.

**D2. Markdown is the baseline renderer and the only one required.** It is returned as MCP tool text content and is what an agent is told to show. It uses symbols and plain structure only: no ANSI colour, no HTML, no alignment that needs a monospace font. It must read correctly as raw text. The current enforcement card is the starting point.

**D3. Richer renderers are optional and chosen by client capability.** MCP image content and MCP Apps `ui://` resources (host-themed, where the host passes theme variables) are added only where a client is known to support them, detected from the MCP `initialize` handshake. An unknown client always gets D2. No feature may exist only in a richer renderer.

**D4. A Claude Code mod is the first native renderer.** A `ui.render` hook on `ToolGroup` draws a bordered card ("Invariant · N contract checks ✓") for groups made wholly of Invariant calls, and a band above the prompt shows a per-turn tally. The prototype was tested in the Claude Code terminal. It was not tested in the VS Code extension, desktop or mobile. Two things learned: the terminal folds MCP calls into a `ToolGroup`, so a `ToolUse` hook alone never draws; and a `Box` that holds the engine's own row refuses `width`.

**D5. A pass never claims more than was checked.** A check that found no component uses to verify is not shown as a pass. Done in `passCard` (`invariant · <file>: no violations, but no component uses were found to check against the <contract> contract`).

**D6. Agent-written receipts come from tool data, not memory.** The rules files and the MCP server instructions tell the agent to end a UI task with a receipt. The receipt is built from the final validate call's card, so it states what was checked and not what the model remembers.

## Not decided

- **Where the mod lives.** Candidate: `plugins/claude/invariant`, installed with the existing plugin. Needs a README, a test run with `claude plugin test`, and an owner decision on shipping a mod at all.
- **Card schema and versioning.** The card object is not a contract artifact today. If it becomes part of the MCP `structuredContent`, it needs a version and a JSON Schema (CLAUDE.md, Contract Changes). Not started.
- **Cursor and Windsurf support** for images and MCP Apps. Web search (2026-11-18, secondary sources only, no vendor docs read) found: Cursor is reported to support MCP Apps, VS Code Copilot experimentally; Windsurf and Claude Code are not confirmed; MCP image content reaches the model in Cursor but a forum report says it no longer renders in the chat UI. Treat images as unreliable and verify each client directly before D3 is built for it.
- **Overlap with the `PostToolUse` system line.** The mod card and the existing pass line say overlapping things. Which one stays is open.
- **Violation counts in the tally.** The prototype counts all Invariant calls, not violations.

## Consequences

- Every client gets a readable card on day one through D2. Native polish is additive.
- A Claude Code mod is a second surface to maintain, and can break when the mod API changes.
- Markdown cannot be themed. People on clients without a richer renderer see text only.
