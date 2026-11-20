# Invariant site and docs design system

Status: locked 2026-11-17. Amended 2026-11-17: CLI terminal output uses the clack-style frame; hero terminal generated from real output. Applies to `site/index.html` (marketing), `site/docs/index.html` (docs) and `site/assets/`. Change a decision here first, then in the code. Related: `docs/design/site-and-docs-design-plan.md`, `docs/decisions/0006-site-and-docs-stack.md` (Proposed).

## Web setup (local page)

Added 2026-11-20. `invariant setup` can run in a local web page (`apps/cli/src/web/page.ts`, ADR 0010). It follows this document: the same tokens (dark and light, theme toggle in `localStorage` key `theme`), the system serif for h1 and h2, sans body, mono for output and lists, 3px corners, flat panels and ruled steps, a solid off-white primary button, status shown as text, the constraint-frame logo inline, and no external font, script, image or request. Do not add gradients or shadows to it either. Animation is allowed in one place only: the scan scene (two flat panes, Components and Patterns, shown while setup is scanning or compiling and no question is open). It uses token colors, `color-mix()` tints, no gradient or shadow, a 4.8s loop, and it stops under `prefers-reduced-motion`.

Layout (workbench, chosen 2026-11-19): `.wrap` at 1280px; three columns at 960px and wider — a sticky step list on the left (170px, numbered; the current step sits in a panel with a 1px rule, and each step shows a check or its ticked count on the right), the question in the middle, and a sticky Activity pane on the right (260px) with the whole run's output in order. The list is one panel: a sticky bar (filter, tally tag, Tick all, Clear, Fold all, Unfold all), then rows with a tag on the right for how many of a group are ticked. A fixed footer carries a sentence ("7 patterns will be approved") and the Confirm button while a list question is open. Below 960px it is one column: steps in a grid, the question, then Activity. There is no Back button: the setup flow cannot re-ask a question, so the step list is not clickable. The header has Start over (two clicks: the first arms it for 4 seconds) and Stop setup; both disappear once setup has finished or stopped.

## Intent

The site speaks to engineering, product and design-system leaders who must trust a governance tool. It should feel like a well-set technical document, not a SaaS template: flat, ruled, typographic, evidence first. Show real output instead of illustrations.

## Principles

1. **Real output, not decoration.** Terminals, tables and the contract explorer show actual CLI output or data copied from a golden fixture. Never invent output. If something is a mock, label it "illustrative" in the UI.
2. **The page obeys the product's rules.** Anything not hard-sourced carries a status (`discovered`, `documented`, `inferred`, `approved`). No fake logos, testimonials, metrics or screenshots. No marketing for unshipped features (`invariant preview` is held until ADR 0004 ships).
3. **Two readers, humans and agents.** Docs get agent-readable output when the docs stack is built (see ADR 0006).
4. **One command above the fold.** `npx @invariant-ui/cli setup` with a Copy button.
5. **Flat and quiet.** No gradients, glows, orbs, animated grids, floating or bobbing panels, scroll-reveal effects, hover spotlights, per-card icons or scroll progress bars. These were removed on purpose because they read as machine-made.

## Color tokens

Defined on `:root` in both pages. Use the tokens, never raw hex, in new CSS.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0e0e0d` | Page background (warm near-black, not navy) |
| `--panel` | `#151514` | Terminals, tables, code blocks, panels |
| `--line` | `#2a2a27` | All borders and rules |
| `--text` | `#ece9e2` | Body and headings (warm off-white) |
| `--muted` | `#9a968c` | Secondary text, labels |
| `--accent` | `#7c8cff` | Links, focus rings, the logo's accent square, code keys. Use sparingly |
| `--accent2` | `#5eead4` | Terminal prompt `$` and the documented status only. Never as a gradient |
| `--ok` `--warn` `--bad` | `#4ade80` `#fbbf24` `#f87171` | Pass, warning, error |

Fact-status colors (`--st-discovered`, `--st-documented`, `--st-inferred`, `--st-approved`) map to ok, accent2, warn, accent. A status is always shown with its text label, never by color alone.

Docs also use a few darker panel shades (`#1b1b19`, `#121211`, `#131312`, `#191917`, `#1d1d1a`, `#1f1f1c`). They are warm neutrals. Do not reintroduce navy-tinted shades.

Light theme (added 2026-11-18): both pages follow `prefers-color-scheme`, and a nav icon button (sun or moon) overrides it and stores the choice in `localStorage` key `theme`. Light values are set on `:root[data-theme=light]` and in the matching media query: `--bg #faf9f6`, `--panel #f1efe9`, `--line #dcd8cd`, `--text #1c1b18`, `--muted #66625a`, `--accent #4553d6`, `--accent2 #0f766e`, `--warn #a16207`, `--bad #b91c1c`, `--ok #15803d`. Extra tokens `--sunk`, `--p0`, `--p2`, `--p3` replace the darker panel shades and `--on-accent` is the text on accent fills. Tints use `color-mix()` on the tokens, never raw rgba. The logo's inner square stays `#7c8cff`. The generated hero keyframes (`demo:start`) still use the dark accent tint, and `hero.mjs` must emit `color-mix(in srgb,var(--accent) 35%,transparent)` instead of `rgba(124,140,255,.35)`.

## Typography

- **Headings (h1, h2):** system serif stack, `"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif`, weight 500, `letter-spacing:-.015em`. The hero h1 sets the second line in italic.
- **Body:** system sans, `system-ui,-apple-system,"Segoe UI",Roboto,sans-serif`.
- **Logo word:** system sans (same stack as body), weight 600, `letter-spacing:-.035em`. Chosen 2026-11-17 (option G, `docs/design/logo-options-3.html`). Never serif.
- **Code, commands, labels, status chips, kickers:** system mono, `ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`.
- No webfont and no external requests. Do not add one without an ADR.
- h3 and card titles stay sans, weight 600.

## Shape and layout

- Square corners: `border-radius:3px` on panels, buttons, tabs, chips, inputs. Never pill-shaped (no 99px radius) and no 12px card rounding.
- Cards are ruled columns: a 1px top rule, no box, no background, no hover lift. Hover only brightens the rule.
- Marketing sections use a two-column grid: a 120px left label column (mono, uppercase, muted) and the content on the right. Tables, the explorer and the PR-check mock span both columns. Below 720px it collapses to one column.
- Page width is `.wrap` at 1040px, 24px side padding (20px on mobile).
- Primary button is solid off-white (`--text` on `--bg`), not accent-filled. Secondary is outlined.
- Docs keep their existing structure: sticky top bar with search, 268px left sidebar, content column up to 780px, search results with `⌘K`.

## Components

- **Install pill:** a square bordered box with `$`, the command in mono and a Copy button. Copy confirms with "Copied" or falls back to "Press Ctrl+C". Needs a visible focus ring.
- **Command blocks:** the command blocks in Get started and the agent setup block in Connect each have a Copy button in the top-right corner, with the same confirmation and fallback as the install pill. Copy the whole block as shown, including the client name chosen in the selector.
- **Tabs (How it works):** accessible `tablist`, arrow-key navigation, one terminal panel per tab, all panels visible without JavaScript.
- **Fact table and filters:** status badges with confidence for inferred facts, filter buttons using `aria-pressed`. The `approved` row says there is no sample and that approval is a named person's decision in `invariant.decisions.json`.
- **Contract explorer:** hidden since 2026-11-19 (the `#explorer` section is in an HTML comment; the data block and its script stay, and the script returns early when the section is absent). Read-only view of the `acme-ui` golden fixture. Its data is generated into `site/index.html` between the `explorer:data` markers by `node site/build/explorer.mjs` run from the repo root. Never hand-edit that JSON.
- **Agent selector and PR-check mock:** the selector rewrites `invariant agent init <client>`. The PR-check panel is labeled "illustrative" and uses only findings already shown elsewhere on the page.
- **Terminal and code blocks:** `--panel` background, 1px `--line` border, mono 13 to 13.5px, colored spans use `.p` (prompt, teal), `.c` (muted), `.ok`, `.w` (warning), `.b` (error red) and `.k` (accent).
- **CLI output in a terminal block:** uses the clack-style frame that `invariant compile` and `invariant verify` print (drawn in `apps/cli/src/frame.ts`, no dependency). `┌` opens the frame with the command name in bold (`<b>`). Every line sits behind a `.c` bar `│`. `◇` (`.ok`) marks a completed step, `▲` (`.w`) a warning and `■` (`.bad`) an error. `└` closes it: `.ok` text when it passed, error color when it failed. The `report` line gives the path to `invariant.report.html`. Blocks copy real output from a run of the CLI on a fixture.
- **Hero demo:** the animated terminal's output comes from real CLI output. `site/build/hero.mjs` runs `invariant init` and `invariant compile` on a scratch copy of `fixtures/react/design-system` and rewrites two regions of `site/index.html`: the keyframe block between `demo:start (generated)` and `demo:end`, and the terminal between `demo:tty:start` and `demo:tty:end`. Regenerate with `pnpm build && node site/build/hero.mjs`. Do not edit either region by hand. The contract panel is illustrative and stays hand-written.
- **Motion:** allowed only for the hero h1's rotating verb ("build with", "verify against", "enforce", in that order: each phrase rises and fades in every 3.2s; screen readers get the static text "build with, verify against, and enforce"; without JavaScript or with reduced motion it stays on "enforce"), the hero demo typing, the chat demo in the "In your chat" section (plays once when scrolled into view, then unlocks a scripted Send turn driven by plain JS timers, labeled illustrative; its tool results come from the `page-archetypes` fixture) and the pull request demo in "Every pull request" (hand-written CSS loops, labeled illustrative), the tab/filter state changes and copy feedback. Everything respects `prefers-reduced-motion`.

## Plans and waitlist

Added 2026-11-19. Section `#plans` between Trust and Get started. Prices are hidden on purpose while demand is validated; do not add numbers without the owner's decision.

- Standard pricing layout, the one place the "ruled columns, no box" card rule is lifted: three equal boxed columns (1px `--line` border, 3px radius, `--panel`) with tier name, large serif price slot, one-line description, CTA, a rule, then a feature list. The middle tier (Team) has an `--accent` border and a "Waitlist" tag. Each column is a flex column; the description and CTA blocks have a minimum height so the feature lists start on the same line. Below 900px the columns stack and the minimums drop.
- The price slot shows "Free", "Planned" and "Custom", never a number. Every feature has a `✓`; all checks are green; normal text means it exists, grey text means it is planned, explained in a line under the columns. The CTA wrapper is `.plan-cta`, not `.cta` (the hero's flex class). Nothing is presented as purchasable.
- The Team form (`#waitlist`) posts to a Google Apps Script web app that appends to a private Google Sheet (setup and script: `docs/commercialization/waitlist-apps-script.md`). This is the only place the site contacts another origin, and only when the visitor submits. A small inline script sends it with `fetch` and shows the result in place (`#waitlist-msg`: a confirmation or an inline error); without JavaScript the form posts normally. No external script, cookie or tracker. It collects an email, a hidden `plan` value and a hidden `src` value (which link led to the form: `nav`, `ci`, `patterns` or `plans`, set from `data-wl` on the link), and has a hidden honeypot field (`_gotcha`). The form is one row (email field plus button, label visually hidden) so the three CTAs are the same height. The privacy line sits in the note under the columns and must stay true: the email is used only to announce Team.
- Founding cohort (added 2026-11-19): the Team tag reads "Founding cohort", the card has a 3px accent rule inside its top edge, and the description states "Early access for the first 25 teams on the waitlist." The cap is a promise: if the number changes, change it here and in `#plans` together, and do not show a count of signups unless it is read from the real sheet. No timers, no "spots left" claims.
- Enterprise card hidden since 2026-11-19 (HTML comment in `#plans`; the grid is 2 columns while it is hidden). When shown, its button links to an external booking page.
- The booking URL is a placeholder (`cal.com/REPLACE-ME`) until the owner supplies it; the form action is the live Apps Script URL. Do not publish with placeholders.
- The cost FAQ answer and its `FAQPage` JSON-LD entry were changed together to mention the waitlist.

## Plans and waitlist

Added 2026-11-19. Section `#plans` between Trust and Get started. Prices are hidden on purpose while demand is validated; do not add numbers without the owner's decision.

- Standard pricing layout, the one place the "ruled columns, no box" card rule is lifted: three equal boxed columns (1px `--line` border, 3px radius, `--panel`) with tier name, large serif price slot, one-line description, CTA, a rule, then a feature list. The middle tier (Team) has an `--accent` border and a "Waitlist" tag. Each column is a flex column; the description and CTA blocks have a minimum height so the feature lists start on the same line. Below 900px the columns stack and the minimums drop.
- The price slot shows "Free", "Planned" and "Custom", never a number. Every feature has a `✓`; all checks are green; normal text means it exists, grey text means it is planned, explained in a line under the columns. The CTA wrapper is `.plan-cta`, not `.cta` (the hero's flex class). Nothing is presented as purchasable.
- The Team form (`#waitlist`) posts to a Google Apps Script web app that appends to a private Google Sheet (setup and script: `docs/commercialization/waitlist-apps-script.md`). This is the only place the site contacts another origin, and only when the visitor submits. A small inline script sends it with `fetch` and shows the result in place (`#waitlist-msg`: a confirmation or an inline error); without JavaScript the form posts normally. No external script, cookie or tracker. It collects an email, a hidden `plan` value and a hidden `src` value (which link led to the form: `nav`, `ci`, `patterns` or `plans`, set from `data-wl` on the link), and has a hidden honeypot field (`_gotcha`). The form is one row (email field plus button, label visually hidden) so the three CTAs are the same height. The privacy line sits in the note under the columns and must stay true: the email is used only to announce Team.
- Founding cohort (added 2026-11-19): the Team tag reads "Founding cohort", the card has a 3px accent rule inside its top edge, and the description states "Early access for the first 25 teams on the waitlist." The cap is a promise: if the number changes, change it here and in `#plans` together, and do not show a count of signups unless it is read from the real sheet. No timers, no "spots left" claims.
- Enterprise card hidden since 2026-11-19 (HTML comment in `#plans`; the grid is 2 columns while it is hidden). When shown, its button links to an external booking page.
- The booking URL is a placeholder (`cal.com/REPLACE-ME`) until the owner supplies it; the form action is the live Apps Script URL. Do not publish with placeholders.
- The cost FAQ answer and its `FAQPage` JSON-LD entry were changed together to mention the waitlist.

## Logo

Constraint-frame mark: an outlined 26-unit square (2.4 stroke, 2 radius) holding a 9-unit accent square at its lower left, drawn on a 32-unit grid, beside the word `invariant` in semibold system sans. No period.

- Mark ink is `--text` on dark and `#0e0e0d` on light. The inner square is always `#7c8cff`. Do not recolor it.
- In the nav it is inline SVG using `currentColor`, 22px, with the sans word at 22px and a 9px gap.
- Files in `site/assets/`: `logo-wordmark.svg` (light ink for dark backgrounds), `logo-wordmark-light.svg` (dark ink), `logo-icon.svg` and `favicon.svg` (mark on a dark 6px-radius tile), `og-image.svg`. PNG exports are made from the SVGs with headless Chrome: `logo-wordmark.png`, `logo-icon-512.png`, `favicon-32.png`, `apple-touch-icon.png`, `og-image.png`. Re-export them whenever an SVG changes. See `site/assets/README.md`.
- Options considered and rejected are kept in `docs/design/logo-options.html` and `logo-options-2.html`.

## CLI examples

- **Real output only.** Every example of CLI output on the site, in the docs and in `README.md` (terminal blocks, the PR-check mock's annotation text, the enforcement story and excerpt) copies what the CLI prints today, from a real run on a named fixture: `fixtures/react/design-system` for compile, validate and setup, `fixtures/pattern-validation` for pattern findings, and `pnpm demo` for the enforcement loop. When the CLI's output changes, the examples change in the same commit.
- **Commands are current.** Command names, flags and options in examples on the site, in the docs and in `README.md` must exist in `invariant --help` and in the command's own usage text. Dev scripts named in `README.md` must exist in `package.json`.
- **Formatting is for illustration only.** The site may wrap lines with a hanging indent, color words, and cut a long run with `…` to show an excerpt. It must not change words, codes, numbers, paths or order. Anything that can't be produced from this repository is shown as the command alone (for example `browser run`, which needs Playwright), or labeled "illustrative" in the UI (for example the GitHub check panel).
- **Check before merging.** Every real output line used in an example must appear in the page's text (for the README, in the file itself). The hero terminal is generated by `site/build/hero.mjs` from real output, so regenerate it after any change to what `setup`, `init` or `compile` print.
- **Do not** write example output by hand, copy it from an older version, or keep a sample after the CLI's output for it has changed.

## Copy rules

- Plain and concrete. Say what the tool checks and what it will not claim.
- Avoid machine-sounding patterns: triplet slogans ("Compile it. Approve it. Enforce it."), "X, not Y" contrasts, and "not just" constructions. Prefer a direct sentence.
- Sample output must be real or labeled illustrative. Fixture-derived rows say so.
- Never imply the tool uses an LLM to decide, fix or approve. No "Fix with AI" language.
- Section headings are sentence case. Nav labels are short nouns.

## Answer-engine optimization (AEO)

- `site/robots.txt` allows all crawlers, including AI ones. `site/sitemap.xml` lists the pages. Add a page there when you add one.
- `site/llms.txt` is the hand-written summary for LLMs. `site/llms-full.txt` is the docs as plain text, generated by `node site/build/llms.mjs` from the repo root. Regenerate it in the same commit as any docs change. Do not edit it by hand.
- Both pages carry a canonical URL, Open Graph and Twitter tags. The home page has JSON-LD (`SoftwareApplication`, `WebSite`, `FAQPage`); the docs have `TechArticle`.
- The FAQ section on the home page and the `FAQPage` JSON-LD hold the same questions and answers. Change both together. Answers state limits (no Figma, React-only pattern checks) and never imply an LLM decides anything.
- Facts in JSON-LD, `llms.txt` and the FAQ must match the docs. Do not add ratings, reviews or counts.

## Do not

- Add gradients, glows, blur orbs, animated backgrounds, floating panels, or icon-per-card decoration.
- Add pill shapes, 12px rounded cards, or navy-tinted surfaces.
- Add customer logos, testimonials, invented statistics or a single aggregate score.
- Add external fonts, scripts or network requests to the site. One exception: the waitlist form (below).
- Edit generated blocks by hand (hero demo, explorer data).
- Change the logo mark or accent color without updating every asset in `site/assets/` and its PNG exports.

## Known gaps

- Mobile layouts and hover states were not checked in a real browser; headless screenshots only covered desktop.
- Search-index changes and the Starlight migration are pending (ADR 0006).
- Only the hero, the "In your chat" demo and the pull request demo are animated; no other section is.
