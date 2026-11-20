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

## The browser setup recording

`pnpm demo:web` records `invariant setup` in the browser: the real CLI and the real local page, driven in headless Chrome over the DevTools protocol, on a scratch copy of `fixtures/storybook/acme-ui` plus the app from `fixtures/pattern-discovery`. It scans, ticks and unticks components, confirms the patterns, confirms the plan, and scrolls through the finish. A small pointer is drawn so the clicks can be followed. It needs Chrome (set `CHROME` to its path if it is not in the default place) and `ffmpeg`.

It writes `setup-web.mp4` (about 1.4 MB, 1280x800, about 59 seconds), `setup-web.webm` and `setup-web-poster.png`. Every run is the same real output, so record it again after the page or what setup prints changes. On the site it would go in as:

```html
<video autoplay muted loop playsinline poster="setup-web-poster.png" width="1280" height="800">
  <source src="setup-web.webm" type="video/webm">
  <source src="setup-web.mp4" type="video/mp4">
</video>
```

For the recording only, the page reaches the real server through a small proxy inside the script that hands over the server's events one at a time with pauses (1.7 s per step, a fraction of a second per log line, about a second per question and per finishing task). The scan on this small project would otherwise finish in a moment and skip the step animations, which a large project shows for longer. The server, the setup code and every answer are the real ones; only the arrival of the events is spaced out, and the product has no such delay. Change the `PAUSE` table in `scripts/demo-web-setup.ts` to speed it up or slow it down.
