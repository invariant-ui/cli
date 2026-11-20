# The enforcement demo

`pnpm demo` runs the whole loop in a scratch copy of the Acme fixtures: an agent is asked for a settings page with a delete button, and the real `invariant hook` process blocks three attempts (a prop value outside the contract, a hardcoded color, a pattern violation) before a clean write passes. It then prints `invariant enforcement report`. The script is `scripts/demo.ts`; the scenario is `scripts/demo-loop.ts`, shared with the e2e test `scripts/enforcement-loop.e2e.test.ts`, so what you see is what CI asserts.

It uses `fixtures/storybook/acme-ui` (components and the approved `page.settings` pattern from `fixtures/pattern-validation`) plus the token package from `fixtures/monorepo/acme`, because `monorepo/acme` has neither approved patterns nor a closed Button prop list.

## Regenerating the GIF

Install [VHS](https://github.com/charmbracelet/vhs), then from the repository root:

```bash
pnpm build
vhs docs/demo/demo.tape
```

This writes `docs/demo/enforcement-loop.gif` (about 15 seconds, under 300 KB), which the README embeds. The tape builds off camera first, then records `pnpm demo`. Re-record it whenever the demo's output changes.

## `setup-discovery.html`

A replayable recording of `invariant setup` in a monorepo whose config was never confirmed: the not-confident warning, the offer to ask Claude Code, the list of every discovered component (untick a file, a directory, everything), the compile of exactly what was confirmed, the list of patterns found from how those components are used (pages, layouts and other recurring structures, ticked or unticked the same way), the plan, and the closing "what to do next" walkthrough. Open the file in a browser (it loads xterm.js from jsdelivr, so it needs a connection). The Claude Code reply in it is a stand-in script so the recording is repeatable; the rest is real CLI output. It is a recording, so it does not change when the CLI does: record it again after changing what setup prints.
