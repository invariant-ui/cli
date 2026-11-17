# Site and docs design plan

Status: draft for review. Nothing here is implemented.

## 1. Method and a caveat

I searched Mobbin for developer-tool hero sections, "how it works" sections, docs pages, and AI review/scan report screens, then read the screenshots. Mobbin has almost no sites for "AI UI governance" tools, because the category barely exists. So I took the closest analogues in three groups:

- CLI and install-first marketing: Firecrawl, Giga, Hermes Agent, Cursor, Linear.
- Docs shells: Clerk, Neon, Mintlify, Framer, OpenAI Platform, Cloudflare, GitBook, Base44, Hashnode.
- Compliance and scan reports: Supabase Security Advisor, Lovable security scan, Base44 store scan, Devin review, Searchable issues.

Every pattern below cites its Mobbin screen. I did not see these sites live, only the captured screens.

## 2. Where the current site stands

`site/index.html` (588 lines) is a single dark page: `#0b0d12` background, `#7c8cff` accent, monospace-led. Sections run problem, how, patterns, proof, ci, discover, trust, connect, start. `site/docs/index.html` is one 1,366-line page with about 30 `h2` sections.

The brand is already right: dark, mono, evidence-first. The gaps are structure, not style:

- The docs are one scroll. There is no task-based entry, no search, no per-page URLs, no copy-for-agent.
- The marketing page tells the story in prose. It does not show the product's real output.
- The trust claims (status labels, evidence, conflicts) are described, not demonstrated.

## 3. Design principles

1. **Show real output, not illustrations.** Every claim is paired with actual CLI output or contract JSON. No stock illustrations (1Password style does not fit).
2. **The page obeys the product's own rules.** Every fact on the site that is not hard-sourced carries a status badge (`discovered`, `documented`, `inferred`, `approved`). No fabricated logos, testimonials, metrics or screenshots. Where a mock is a mock, say so.
3. **Two readers: humans and agents.** Every docs page is also available as clean markdown, with a "Copy for LLM" button and an `llms.txt`.
4. **One command above the fold.** `npx @invariant-ui/cli setup` is the primary call to action everywhere.
5. **Keep the existing palette and mono voice.** Evolve it into tokens, do not replace it.

## 4. Marketing site

### 4.1 Page structure

| # | Section | Job | Pattern source |
|---|---------|-----|----------------|
| 1 | Nav: logo, Docs, Spec, GitHub, copy-install pill | Orientation | Hermes, Cursor |
| 2 | Hero: headline, one-line promise, install command box, secondary "Read docs" | Convert | Hermes, Giga |
| 3 | Hero visual: a real terminal showing `invariant check` output with severity and a fix diff | Prove | Cursor, Devin |
| 4 | Problem strip: three short, concrete agent failures (invented prop, hard-coded color, wrong component) with the contract's correction | Frame | existing |
| 5 | How it works: tabbed Compile / Check / Enforce, command left, output right | Explain | Firecrawl |
| 6 | Trust model: the four fact statuses as an interactive filterable list | Differentiate | Supabase, Lovable |
| 7 | Contract explorer: file tree plus evidence pane | Make the contract tangible | The Content Architecture |
| 8 | Connect your agent: selector for Claude Code / Cursor / other, code changes | Reduce friction | Cloudflare, Neon |
| 9 | CI and enforcement: PR check mock with baseline | Show the adoption path | Devin, Base44 |
| 10 | Safety: static analysis, no network, no execution | Remove objections | existing |
| 11 | Closing CTA: install pill again | Convert | Giga |
| 12 | Footer: Docs, Spec, ADRs, GitHub, license | Navigate | existing |

Remove or demote: the current "patterns" and "discover" sections become part of 5 and 7 rather than standalone sections.

### 4.2 Pattern notes

**Hero install box** ([Hermes Agent](https://mobbin.com/sites/sections/e9c68c38-072b-403d-8888-26042d246b35), [Giga closing CTA](https://mobbin.com/sites/sections/a2004615-5fee-4e7d-9f84-602f3f1ab1f0)). A dark monospace pill: `$ npx @invariant-ui/cli setup`, a copy icon, and a ghost "See it work" button beside it. Hermes adds a tiny mono eyebrow ("OPEN SOURCE • MIT LICENSE"). Use the same eyebrow for "LOCAL ONLY • NO ACCOUNT • MIT". Skip Hermes's ornamental art; it fights an evidence-first brand.

**Hero visual is the product** ([Cursor](https://mobbin.com/sites/sections/d5d45b77-5ade-432e-8093-994917105c34), [Linear](https://mobbin.com/sites/sections/038755ae-4b0f-4e25-a7df-dca35d71d6bc)). Both lead with the real product UI in a window frame. Invariant's equivalent is a terminal/report panel, not an app window. Show one violation: the offending line, the rule, the evidence path to the contract fact, and the suggested fix.

**Tabbed command-to-output** ([Firecrawl CLI](https://mobbin.com/sites/sections/363363b9-a122-4092-8c41-962f962e6a46)). Left rail of three titled steps with one-line descriptions; right pane is a terminal with a Copy button and real output; a bottom strip repeats the step names. This is the best single fit for Invariant's three verbs. It beats the multi-segment stepper in [Retool](https://mobbin.com/sites/sections/f83459c1-5d49-4927-866d-7d2788c41352), which suits long product flows, not three commands.

**Status-badge trust model** ([Supabase Security Advisor](https://mobbin.com/screens/e3ac7f2c-bdd0-42a4-ac13-76fb893fd06d), [Lovable](https://mobbin.com/screens/249b76a6-5a99-48a3-823a-1158adade0d6)). Supabase uses Errors / Warnings / Info tabs with counts, a dense table, and a footer line, "How are these suggestions generated?", linking to the linter. Lovable tags each finding with its source ("LLM Database Check"). Combine them: a table of sample facts with a status badge and a source column, tabs filtering by status, and a footer line explaining that inferred facts never become approved without a human. This turns the product's central honesty claim into something a visitor can click.

**Contract explorer** ([The Content Architecture](https://mobbin.com/sites/sections/29bfe158-19c6-48e3-b87a-f4e5e03b0e6f)). A code-editor shell with file tree, content pane and terminal, captioned "this is the actual repo". For Invariant: a read-only tree of the contract output; click a component and see its props, each with status and source file:line. Must use real extracted output from a fixture, labeled as such.

**Selector-driven code sample** ([Cloudflare AI Gateway](https://mobbin.com/screens/f9e55e3d-7097-491f-8136-58312d972c25), [Neon](https://mobbin.com/screens/94fb6fc0-0fb0-4358-b6da-534a1f5addb9)). Dropdowns that rewrite the snippet. Use for "Connect your agent" (Claude Code / Cursor / generic MCP) and package manager (npm / pnpm / yarn / bun). Persist the choice site-wide.

**Severity chips and readiness bar** ([Searchable](https://mobbin.com/screens/2c836385-d043-4424-b0d0-ca6d0e723438), [Base44 scan](https://mobbin.com/screens/89946769-4d5e-4396-8667-e4523690e0ce)). Colored count chips (`4 critical`, `19 high`) and a segmented readiness bar. Use for the CI section's PR-check mock, with the baseline shown as a separate muted chip. Do not copy Searchable's single big score ring: Invariant rejects an aggregate "score" that hides conflicts.

**Diff for the fix** ([Devin review](https://mobbin.com/screens/e48cb198-fd26-4a92-b17a-a988aa5cbef8)). File tree plus red/green split diff. Use a small version in the hero: agent output before, after contract correction.

### 4.3 Visual system

Keep current tokens, name them, and add a few.

- Surfaces: `--bg #0b0d12`, `--panel #12151c`, `--line #222733` (existing).
- Accent `--accent #7c8cff` for interactive elements only.
- Status colors become a fixed four-color scale, one per fact status, plus severity colors reusing `--ok`, `--warn`, `--bad`. Never rely on color alone: every badge has a text label.
- Type: keep the mono for chrome, labels, commands, eyebrows. Add one readable sans for body (system stack is fine; a webfont is optional). Headline weight 600, tight leading.
- Light theme: required for docs reading (see below); the README already ships light/dark logos, so the assets exist.
- Motion: only on the tabbed terminal (typed output) and the copy confirmation. Respect `prefers-reduced-motion`.

## 5. Docs site

### 5.1 Shell

Three columns on desktop: left sidebar, content, right "On this page". This is the dominant pattern across [Mintlify](https://mobbin.com/screens/731c0653-266e-4c03-aae6-df4d07631ebd), [Framer](https://mobbin.com/sites/sections/a5c2c61a-2584-474e-82fa-4193df231f05), [Hashnode](https://mobbin.com/screens/37af2131-4bd5-4cb2-a888-7abdb45791b8) and [OpenAI](https://mobbin.com/screens/1b39571a-c929-4ba6-934c-9786fc50681d). Specifics:

- Top bar: logo, `⌘K` search field, theme toggle, GitHub link, version pill.
- Left sidebar: grouped, collapsible, current page highlighted, section group labels in small caps.
- Right rail: "On this page", scroll-spy.
- Mobile: sidebar becomes a drawer; the right rail collapses to a dropdown under the title.
- Page footer: previous / next, "Edit on GitHub", last updated.

### 5.2 Agent-readable docs

Directly motivated by [Mintlify's "Copy page"](https://mobbin.com/screens/731c0653-266e-4c03-aae6-df4d07631ebd), [Base44's "Copy for LLM" and "Copy all"](https://mobbin.com/screens/67828c1b-90e1-4e8d-89a1-9e6f6cec99b4), and the llms.txt approach in [The Content Architecture](https://mobbin.com/sites/sections/29bfe158-19c6-48e3-b87a-f4e5e03b0e6f).

- "Copy page" split button on every page: copy markdown, open as `.md`.
- `/llms.txt` index and `/llms-full.txt`.
- Each page served at `<url>.md`.

This is on-brand: a tool for making design systems agent-readable should have agent-readable docs.

### 5.3 Information architecture

Split the current 30-section page into pages under these groups.

1. **Get started**: Introduction, Install, Quick start, Add to your project, See it working in your agent.
2. **Concepts**: How it works, The contract, Facts and evidence, Conflicts and review, Safety model.
3. **Sources**: React, Vue and Angular, Storybook, Design tokens.
4. **Patterns and rules**: Pattern definitions, Pattern discovery, Policies, Decisions.
5. **Enforce**: Validate code, Browser verification, Verify in CI.
6. **Agents**: MCP server, Install the plugin, Agent setup.
7. **Reference**: CLI, Configuration, Output files, Known limitations.
8. **Project**: Contributing, Specifications, ADRs, Changelog.

### 5.4 Page types

**Docs home** ([OpenAI "Start building"](https://mobbin.com/screens/1b39571a-c929-4ba6-934c-9786fc50681d), [GitBook template](https://mobbin.com/screens/785bc3c1-b47a-498a-8da4-bb773239ce04)). A two-column grid of task cards with a small icon, a verb-first title ("Check generated code against your design system") and one line. Below: a "Quick start in 5 minutes" block with the install command and four tiles for Help, Spec, ADRs, GitHub issues.

**Quickstart as a numbered rail** ([Clerk](https://mobbin.com/screens/382be08d-b9cd-412e-b88f-aca632720e08), [Neon](https://mobbin.com/screens/94fb6fc0-0fb0-4358-b6da-534a1f5addb9)). Left column: numbered step with short prose and an "Important" callout. Right column: code block with a filename tab, package-manager tabs and a copy button. Steps: setup, review patterns, connect agent, run a check, add CI. Each step ends with the expected output so a reader can tell it worked.

**Concept pages.** Prose with one diagram or real output sample per page; callouts for "Discovered vs inferred" caveats. Use [Mintlify-style](https://mobbin.com/screens/731c0653-266e-4c03-aae6-df4d07631ebd) Card, Callout, Steps and Tabs components (rendered natively, no per-page imports).

**CLI reference.** One page per command with a fixed layout: synopsis, flags table (name, type, default, description), exit codes, example with real output. Exit codes matter for CI users. Flags table follows [Base44's schema table](https://mobbin.com/screens/67828c1b-90e1-4e8d-89a1-9e6f6cec99b4).

**Contract schema reference.** Generated from the JSON Schema, not hand-written, so it cannot drift from validation. Field, type, required, description, version introduced.

**Report anatomy page.** A new page explaining how to read an Invariant check report: severity, status badge, evidence link, baseline. Annotated screenshot of the Supabase-style table.

### 5.5 Docs components to build

- Code block: filename tab, language label, copy button, line highlight, optional "output" variant (muted, no prompt line).
- Package-manager tabs with site-wide persisted choice.
- Status badge (`discovered`, `documented`, `inferred`, `approved`).
- Severity chip.
- Callout: note, important, caution.
- Steps with numbered rail.
- Card and card grid.
- Terminal block with typed-output animation (marketing only).
- Search (⌘K) with page and heading results.

## 6. Things I recommend not copying

- Hero art and gradients ([Hermes](https://mobbin.com/sites/sections/e9c68c38-072b-403d-8888-26042d246b35), [Linear](https://mobbin.com/sites/sections/038755ae-4b0f-4e25-a7df-dca35d71d6bc)): off-brand for an evidence tool.
- Customer logo strips ([Retool](https://mobbin.com/sites/sections/f83459c1-5d49-4927-866d-7d2788c41352)): we have no customers to name and must not fake them.
- A single aggregate compliance score ([Searchable](https://mobbin.com/screens/2c836385-d043-4424-b0d0-ca6d0e723438)): it hides conflicts.
- "Fix with AI" one-click buttons ([Lovable](https://mobbin.com/screens/249b76a6-5a99-48a3-823a-1158adade0d6), [Base44](https://mobbin.com/screens/89946769-4d5e-4396-8667-e4523690e0ce)): implies LLM authority over fixes. Prefer "Copy fix prompt" or a deterministic suggestion.
- Illustrated isometric art ([1Password](https://mobbin.com/sites/sections/84ae4767-03c2-40fd-a88b-d10071d797d8)).

## 7. Implementation approach (decision needed)

The site is hand-written static HTML. A multi-page docs site with search, generated reference pages and markdown twins needs a build step. Options:

| Option | Pros | Cons |
|--------|------|------|
| A. Astro Starlight | Docs shell, search, i18n, MDX components and sidebar out of the box; static output; themeable to our tokens | One new dev dependency tree, scoped to `site/` |
| B. Keep hand-rolled HTML plus a small build script | No framework | We rebuild nav, search, TOC, markdown twins ourselves |
| C. Mintlify or GitBook hosted | Fastest, best agent-copy UX | Hosted dependency, conflicts with the "no cloud" posture, harder to keep docs in the repo |

Recommendation: A, with the marketing page staying a standalone static page. Per CLAUDE.md this is an architectural change, so it needs an ADR (`docs/decisions/0006-site-and-docs-stack.md`) before implementation. The CLI and packages are untouched, and the site must stay out of the published npm package.

## 8. Phasing

**Update 2026-11-17: marketing site first.** The marketing page is standalone static HTML, so it needs no Starlight and ADR 0006 does not block it. Order: M1 tokens and shared CSS, M2 hero and install box, M3 tabbed command-to-output, M4 trust-model table, M5 contract explorer (fixture import), M6 connect-agent selector and CI mock, M7 polish. Docs phases below follow afterward. The existing docs page stays as is, and the new marketing page must keep linking to `/docs/`.

1. **Tokens and components.** Extract CSS tokens, build code block, badge, chip, callout. Both themes.
2. **Docs shell.** Scaffold (per ADR), three-column layout, search, split the existing page into the section above, redirects for current anchors.
3. **Docs content upgrades.** Quickstart rail, CLI reference pages, generated schema reference, copy-for-LLM, `llms.txt`.
4. **Marketing page.** Hero, tabbed command-to-output, trust model, contract explorer, connect-agent selector, CI mock.
5. **Polish.** Accessibility audit (contrast, keyboard, reduced motion), OG image refresh, performance budget (no JS framework on the marketing page).

## 9. Decisions (made 2026-11-17, owner delegated)

1. **Stack:** Astro Starlight for docs, standalone static HTML for the marketing page. Recorded in `docs/decisions/0006-site-and-docs-stack.md` (Proposed).
2. **Theme:** docs get light and dark; marketing stays dark.
3. **Contract explorer:** uses real compiled golden-fixture output, labeled as sample.
4. **Audience:** lead with the maintainer who runs `setup`. The agent-chat demo is the proof under the hero, not the hero.
5. **Preview:** `invariant preview` is held off the site until it ships (ADR 0004 is still Proposed). No marketing for unshipped features.

Still open: hosting target and base path.

## 10. Mobbin references

Hero and install: [Hermes Agent](https://mobbin.com/sites/sections/e9c68c38-072b-403d-8888-26042d246b35), [Giga](https://mobbin.com/sites/sections/a2004615-5fee-4e7d-9f84-602f3f1ab1f0), [Cursor](https://mobbin.com/sites/sections/d5d45b77-5ade-432e-8093-994917105c34), [Linear](https://mobbin.com/sites/sections/038755ae-4b0f-4e25-a7df-dca35d71d6bc).
How it works: [Firecrawl](https://mobbin.com/sites/sections/363363b9-a122-4092-8c41-962f962e6a46), [Retool](https://mobbin.com/sites/sections/f83459c1-5d49-4927-866d-7d2788c41352), [Bird](https://mobbin.com/sites/sections/cddb70d8-8531-4a78-991e-d472aeeb2d95), [The Content Architecture](https://mobbin.com/sites/sections/29bfe158-19c6-48e3-b87a-f4e5e03b0e6f).
Docs: [Vercel](https://mobbin.com/screens/8f10d056-15b3-4469-a3d1-7bd371906584), [GitBook](https://mobbin.com/screens/785bc3c1-b47a-498a-8da4-bb773239ce04), [Cloudflare](https://mobbin.com/screens/f9e55e3d-7097-491f-8136-58312d972c25), [Neon](https://mobbin.com/screens/94fb6fc0-0fb0-4358-b6da-534a1f5addb9), [OpenAI Platform](https://mobbin.com/screens/1b39571a-c929-4ba6-934c-9786fc50681d), [Hashnode](https://mobbin.com/screens/37af2131-4bd5-4cb2-a888-7abdb45791b8), [Base44](https://mobbin.com/screens/67828c1b-90e1-4e8d-89a1-9e6f6cec99b4), [Clerk](https://mobbin.com/screens/382be08d-b9cd-412e-b88f-aca632720e08), [Mintlify](https://mobbin.com/screens/731c0653-266e-4c03-aae6-df4d07631ebd).
Reports: [Supabase](https://mobbin.com/screens/e3ac7f2c-bdd0-42a4-ac13-76fb893fd06d), [Lovable](https://mobbin.com/screens/249b76a6-5a99-48a3-823a-1158adade0d6), [Devin](https://mobbin.com/screens/e48cb198-fd26-4a92-b17a-a988aa5cbef8), [Searchable](https://mobbin.com/screens/2c836385-d043-4424-b0d0-ca6d0e723438), [Base44 scan](https://mobbin.com/screens/89946769-4d5e-4396-8667-e4523690e0ce).
