# ADR 0006: Site and docs stack

Status: **Proposed.** No code is written.
Related: `docs/design/site-and-docs-design-plan.md`

## Context

`site/index.html` and `site/docs/index.html` are hand-written static pages. The docs are one 1,366-line page. The design plan calls for per-page docs with search, a right-hand table of contents, a markdown copy of every page, `llms.txt`, and a CLI and schema reference generated from source. Doing that by hand means rebuilding navigation, search, and markdown output ourselves.

Constraints: Invariant is local-first with no cloud dependency, docs live in the repo and are reviewed in PRs, and the CLI and packages must not gain site dependencies.

## Decision (proposed)

**D1. Docs use Astro Starlight.** It gives the three-column shell, sidebar, search, and MDX components as static output, and can be themed to Invariant's tokens. Hosted docs (Mintlify, GitBook) are rejected: they add a cloud dependency and move content out of the repo.

**D2. The marketing page stays standalone static HTML and CSS.** No framework runtime on it. It shares design tokens with the docs through one CSS file.

**D3. The site is isolated.** It lives in `site/` as its own workspace package, `private: true`, never published. Its dependencies do not touch `apps/cli` or `packages/*`, and `pnpm-workspace.yaml` must keep it out of release and npm packaging.

**D4. Docs reference pages are generated.** The schema reference comes from the contract JSON Schema, and CLI flags from the CLI's own command metadata, so the docs cannot drift from validation or behavior. Hand-written reference pages are not allowed for these.

**D5. The contract explorer uses real compiled fixture output.** A build step imports a golden fixture and renders it. The page labels it as sample output. No fabricated facts.

**D6. Docs ship light and dark themes.** The marketing page stays dark.

**D7. Agent-readable output is part of the build.** Every docs page is emitted as `<url>.md`, plus `/llms.txt` and `/llms-full.txt`.

## Consequences

- One new dependency tree, scoped to `site/`, needs approval when the build starts.
- Existing docs anchors change; the build must emit redirects from old `#fragment` URLs where a static host allows, otherwise keep a mapping page.
- No contract, schema, or compatibility change. No migration.

## Open

- Hosting target and base path (`invariant-ui.com/docs/`) must be confirmed before the Starlight config is written.
