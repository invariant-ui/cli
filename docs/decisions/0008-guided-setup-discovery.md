# ADR 0008: Guided discovery in `setup`

Status: **Accepted**. Extended by ADR 0009 (a complete scan with no file limit, and agent-assisted discovery). Adds optional configuration (`componentSources`, `discovery`) and scopes compilation to approved paths. The contract schema does not change.

## Context

`setup` wrote every detected source without asking. A config `sources[].path` can only sit at or above a package directory (adapters discover per package), so a person could not say "the components are in `src/components`", and a sub-folder path silently compiled to nothing. Applications were found only in `src`, `app`, `pages` and `apps` at the root, and recurring structures were proposed only as plain `composition` patterns.

## Decision

Three separate concerns, in `apps/cli/src/sources/`:

- **Project recognition** (`recognize.ts`): decides what each package is (`design-system`, `application`, `tokens`, `icons`, `utility`) from independent signals (name, description, framework peer dependency, entry points and exports, Storybook, component folders, consumers, build script, tokens), minus application signals. The score is a heuristic from 0 to 100; 80 and above is high, 50 and above is medium. A role set in `discovery.packages` is authoritative.
- **Source discovery** (`discover.ts`): per package, finds components by syntax (`detectReactComponents`, `detectAngularComponents`, `detectVueComponents`, each in its framework's compiler package, returning the neutral `DetectedComponent`), groups them into directories (component-per-folder rolls up, nested roots merge, siblings under `components`, `ui` and similar merge), and scores each directory with an evidence list. Two profiles: a **component library** gets weight for package membership and public exports and is never asked for consumers; an **application** gets weight for cross-feature reuse (from relative imports and `@/`/`~/` aliases) and loses weight for services, models, API calls, routing and feature folders. Correlated signals share a family cap, and a score cannot reach high without two kinds of independent evidence.
- **Source approval** (`approval.ts`, `review.ts`): the person ticks directories, can view components and evidence, add a directory or one component file, and confirm. Decisions are saved as `componentSources` (`path`, `type` directory or file, `source` discovered, user or configuration, `status` approved, excluded or pending). A rerun never approves an excluded path and never drops a user addition; a `pending` entry never replaces a decision.

Compile reads only approved paths. When any `componentSources` entry is approved, the react, vue and angular adapters are wrapped (`sources/scope.ts`) to leave out components whose file is out of scope, the most specific decision winning. This is reported in an info diagnostic, never silently.

Candidates gain an optional, inferred `archetype` (page or layout) from file paths, as before.

## Non-interactive use

With no terminal, setup asks nothing and approves nothing on its own. `--yes` or `--confirm-contract` accept the recommended directories. `--include` and `--exclude` (or the older `--sources`, an alias of `--include`) name them. Without any of these it reports that confirmation is required and writes nothing. The same holds when the scan finds no components in a project that has a UI framework, or recommends nothing (ADR 0009). `--discover-only` prints the recognition and candidates as JSON and writes nothing. `--rediscover` runs the review again on a project that already has a config, starting from the saved decisions.

## Consequences

- Interactive runs ask about component directories first (checklist on a terminal, typed numbers otherwise), then applications, then each proposed pattern.
- The compiled contract now holds only components in approved paths. Previously a sub-folder source compiled to nothing.
- Syntax detection finds internal components the entry-point-based adapters do not, so a directory can be approved that holds components the contract will not list (only exported ones reach it).
- Limits: `.gitignore` support reads the root file only, and anchors patterns as git does, but does not model negation or nested files (so the scan can read more than git tracks, never less); imports are resolved for relative paths and `@/`, `~/` only (not tsconfig paths); Vue import graphs are not read; pages and layouts are classified from `.tsx` and `.jsx` only.
