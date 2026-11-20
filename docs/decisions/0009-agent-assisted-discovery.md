# ADR 0009: A complete scan, and agent-assisted discovery, in `setup`

Status: **Accepted**. Extends ADR 0008. Adds an optional `agent` value and an optional `note` to `componentSources` in `invariant.config.json`. The contract schema does not change.

## Context

`setup` read the project in alphabetical order and stopped at 20,000 files (project discovery stopped at 50,000), saying only that the results "may be incomplete". On a large monorepo the folders that sort last were the ones cut off, and `packages/` sorts after `apps/`. On a generated test repository of 104,000 files setup saw 52 of 231 packages and found no component directory, which is the worst result for a first run on an organization's monorepo.

Two more things went wrong on layouts the heuristics do not model (Nx libraries, path aliases, components in an unconventional folder). A scan that found nothing it trusted went on and compiled the detected sources without asking, so the person never confirmed the components. And there was nothing to fall back on when the scan was unsure, although the person's AI agent can read code and often can tell.

## Decision

**D1. The scan is complete.** There is no limit on the number of files. The walk is sorted and deterministic, does not follow symlinks, and skips only dependencies, build output and what the root `.gitignore` names (a pattern with a slash in front or in the middle is anchored to the root, a bare name matches at any depth, as in git). Recognition, discovery and the analysis of an added path share one walk. Each source file is read once and reduced to the facts the scoring needs, so memory grows with the number of files and not with their size. The number of files and folders is shown, with a live count while it runs. On the 104,000-file test repository setup now sees all 231 packages and finds the design system in about two seconds.

The compile adapters (React, Vue, Angular) keep their limit of 20,000 files per package, because they build a type program from the files. They no longer count another package's folders against it, and when a package is still cut they say so in a warning (`react.walk-truncated` and the like) instead of dropping files without a word. The Storybook adapter is unchanged.

**D2. Confidence is stated.** `assess()` (`sources/confidence.ts`) is the confidence of the strongest directory setup would recommend, and low when it would recommend none or found no components. `--discover-only` prints it as `confidence: { level, reasons }`.

**D3. An agent is offered only when confidence is low and someone can answer.** It is never started by `--yes`, by `--include`, or without a terminal: starting one sends what it reads to its provider, so the person's choice is the consent, and the screen says so before the choice.

**D4. How an agent is started and held to reading** (`sources/agents.ts`). Agents are detected by looking for their command on `PATH` (`claude`, `codex`, `cursor-agent`); nothing is run to detect them. The prompt goes in on standard input (Claude Code, Codex) or as the last argument (Cursor). Each runs read-only:

| Agent | Options |
| --- | --- |
| Claude Code | `-p --tools Read,Grep,Glob --strict-mcp-config --no-session-persistence` |
| Codex | `exec --sandbox read-only --skip-git-repo-check -` |
| Cursor | `-p --mode ask --output-format text` |

A run stops after 15 minutes, or at once on Ctrl+C. Windsurf, and the IDE versions of the others, have no command to start, so they cannot be run from setup. They can follow the skill by hand and pass what they find to `--include`.

**D5. One skill for two readers.** `invariant-setup` (`packages/agent-kit/src/scan-skill.ts`) tells an agent what a design system component is and is not, how to look (workspace layout, the design system's own signals, who imports it, verifying each directory), and how to answer. The plugin ships it as a skill for an agent a person starts; the CLI sends the same text, plus what the scan found and the rule that nobody reads the reply, as the prompt of the agent it starts. It names no component, because it runs before a contract exists. The reply is one JSON object: `version`, `directories` (each with `path`, `confidence` and `reason`) and `notes`. An empty list with a note is a valid answer, and the real run on a small application returned exactly that.

**D6. What an agent's answer is.** A proposal. It is read leniently (bare, fenced or inside prose; a trailing comma, which a real Claude Code reply contained, is forgiven) and then checked strictly:

- each path must be project-relative, must exist, must be a directory, and must hold components that setup's own syntax detection finds. Anything else is dropped and the reason is shown;
- a directory inside another one the agent named is dropped, because the outer one covers it;
- text from the agent is cleaned of control and escape characters before it is printed, because it was produced by a model that read a repository;
- the agent's confidence and reason stay with the directory. The review shows them next to the scan's own evidence, and says that the choice is an agent's judgment. The saved decision records `source: "agent"` with a `note` (who, how sure, why); where the scan had already recommended the directory itself, it stays `discovered` and the note says "also suggested by". An agent's doubt never lowers what the scan recommended, and its confidence is never mixed into the scan's score.

Nothing an agent names is approved until the person confirms it, as with every other directory.

**D7. Setup does not go on until the components are confirmed.** On a terminal, low confidence offers: ask an agent found on this machine, choose from what the scan found or add directories, compile everything the packages export (a choice the person makes, not a default), or stop. With no components found, the review opens with nothing listed and the person adds directories. Without a terminal, a scan that found no components in a project that has a UI framework, or recommended nothing, writes nothing and says why, and points to `--include` and to the `invariant-setup` skill. `--yes` accepts what was recommended and nothing more. A project with no React, Vue or Angular package is unaffected.

**D8. A configuration nobody confirmed is reviewed too.** Setup used to reuse an existing `invariant.config.json` as it was, so a repository set up by an earlier version never got the scan, the review or the agent offer (version 0.12.0 behaved the same for it). A configuration with a React, Vue or Angular source and no approved `componentSources` is now reviewed exactly like a first run, and setup does not go on until the person has confirmed the components. `componentSources: []` records that the person chose to compile everything the packages export, so they are not asked again. A confirmed configuration is used as it is, and the "using invariant.config.json" line says that `--rediscover` reviews it again. Stopping the review leaves the file unchanged. Framework sources that read an installed package (`declarations`) are kept when the other framework sources are regenerated from the approved paths. A configuration written as code cannot be edited by setup, so it is not reviewed, and setup says so. The review menu also offers the agents found ("Ask Claude Code to help find them"), at any confidence, because a scan that is sure can still be wrong for a given repository.

**D9. The review lists every discovered component.** The review is a complete list of the source files that hold potential components, grouped by directory, best groups first, with the directories the scan did not recommend included and unticked. A row is one source file and names the components in it, because compile scopes by file: components in the same file are chosen together. The person ticks or unticks a row, a whole directory, or everything (`a` ticks all, or clears when all are ticked; `n` clears), folds groups, and scrolls: the list draws a window of rows, so hundreds of rows do not run off the screen (the other menus scroll too). Without arrows it prints the numbered list and takes `a`, `n` and numbers or ranges. The result is saved as directory decisions plus a decision for each file that differs from its directory (`source: "user"`), chosen so that exactly the ticked files count; a weak directory nobody ticked is left undecided rather than recorded as rejected.

**D10. Patterns are found from how the confirmed components are used, anywhere in the project.** Setup used to look for patterns only in application folders it could guess (`src`, `app`, `pages`, `apps`, or packages depending on a confirmed package), and only in React files, so an Angular repository with its application in an unconventional folder found nothing, and the `discover` command stopped at 5,000 files. Setup now takes every file from the full scan that can use a component (`.tsx`, `.jsx`, `.vue`, `.html`, and inline templates in `*.component.ts`), keeps those that mention a component of the compiled contract by name or selector, leaves out the files that define the components, and finds the structures that recur in them. Pattern discovery reads Vue, Angular and HTML templates as well as JSX (by name or selector, since a template has no imports); nesting is read, but `*ngIf`, `v-if` and loops are not yet marked as conditional or repeated. The candidates are listed as a tick list like the components (pages, layouts, other structures; the strongest start ticked); unticking one leaves it a proposal and does not record a rejection. A promoted pattern's `appliesTo.frameworks` comes from the files that show it. Setup ends with a walkthrough of what to do next. The `validate` file limit was raised from 5,000 to 100,000.

## Consequences

- A first run on a large monorepo sees all of it, and says how much it read.
- When the scan is unsure the person has a way forward that is not guessing, and the agent's help is visible, checked and attributed.
- Starting an agent sends file contents to its provider, at the person's choice. Invariant cannot verify what the agent does with them beyond the options in D4. The Claude Code options were run for real on a fixture. Codex's follow its documented CLI reference. Cursor's were accepted by its command, but it was not signed in on the machine used, so its run was not seen end to end.
- Limits: only the root `.gitignore` is read, and negations are not modeled, so the scan can read more than git tracks and never less; imports are still resolved for relative paths and `@/`, `~/` only, not tsconfig `paths`, which is why Nx-style libraries often score low and reach the agent; the agent's accuracy on a given repository is not guaranteed.
