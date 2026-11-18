# ADR 0008: Guided discovery in `setup`

Status: **Accepted**. No contract change.

## Context

`setup` wrote every detected component source without asking, looked for applications only in `src`, `app`, `pages` and `apps` at the repository root (so monorepo apps were missed), and proposed every recurring structure as a plain `composition`. The GitHub Action was not last.

## Decision

- **Confirm where components live.** Detected folders are offered for selection; the person can add paths. Added paths are inferred from file names only, so nothing runs.
- **Find applications by dependency.** Workspace packages that depend on a confirmed component package are the application folders.
- **Classify page and layout candidates from paths.** `archetype` on a candidate is optional, additive and `inferred`, with confidence and evidence. The candidates file stays at version 1 because older files remain valid; a reader older than this change rejects files that carry it.
- **A person confirms, denies or directs.** Deny records a rejected review. Direct sets the name and category. Nothing is approved without the existing confirmed-contract gate.
- **CI is last.**

## Consequences

- Interactive runs ask more questions before the plan. Scripted runs use `--sources`, `--paths`, `--yes`, `--only`.
- Component folders use an arrow-key checklist on a terminal (`io.multiselect`; every folder starts ticked; space toggles, `a` toggles all, Esc ticks none). Where a tool injects only `prompt`, typed numbers are the fallback. Added paths are always typed.
- Page/layout detection is path-based only. It does not read component names inside the files, and it does not detect pages in Vue or Angular (discovery reads `.tsx`/`.jsx` only).
