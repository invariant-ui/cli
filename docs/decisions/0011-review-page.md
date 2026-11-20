# ADR 0011: The review list is a local page

Status: accepted

## Context

`invariant review list` printed a table of the open conflicts and inferred facts. To decide one, a person had to run `review show <id>` to read the evidence and what each source says, then type `review resolve|accept|dismiss|approve|reject <id> --as <name>`, then run `compile`. With dozens of items that is slow, and nothing in the terminal reads as a report of where the contract stands.

## Decision

**D1. On a terminal, `review list` opens a page in the browser.** It is the same kind of local page as setup's (ADR 0010): loopback address, a random token, Host and Origin checks, a content-security policy that allows no external request, the `site/design.md` tokens, and text put in with `textContent` only. The guard is one shared module (`apps/cli/src/web/guard.ts`) used by both pages. `--terminal` and `--json` keep the table, `--web` opens the page where it would not be offered, and with no terminal the table is printed as before.

**D2. The page is a report and a place to decide.** The top is a report: the number of open conflicts, inferred facts and pattern facts, the high-priority ones, and decisions recorded but not yet applied, with what the contract holds (components, tokens, patterns, guidelines). Below it, a filterable list (kind, priority, open or recorded, search) and a detail panel for the chosen item: why it needs a decision, the evidence (file and line), and for a conflict a table of what each source says with a "Use this" button per source, plus Accept (a known difference) and Dismiss (not a real conflict). A fact has Approve, and Reject if it is inferred. A note and a reference are optional. After a decision the page moves to the next open item.

**D3. The page adds no way to write.** Every decision is recorded by running `invariant review <action> <id> --as <name>` in the same process, so the checks are the command's own: who may decide (`governance.approvers`), which action fits which kind, and the stale-claims check. The page only checks the shape of a request (known action, bounded lengths) and refuses anything else. **Apply** runs `compile`, which is what makes a recorded decision take effect, as on the command line. Names are recorded, not authenticated, as before.

**D4. State is the decisions file.** An item with a decision in `invariant.decisions.json` that a compile has not yet applied is shown as recorded, so a reload or a second run shows the same thing. Nothing else is stored.

**D5. It is also a step of the browser setup** (ADR 0010, D6): the same page, framed by the setup page, with the header and report text left out and the list and detail panes scrolling on their own. The frame reports how many decisions are recorded but not applied, so setup can say so before the person continues.

## Consequences

- Reviewing is one place: read, decide, apply.
- The contract, the decisions file format and the commands are unchanged; no migration.
- The review page and the setup page share the guard, so a fix to one applies to both.
- Limits: one local session; no code excerpt of the evidence (a file path and line only, so the server reads no source file); no undo besides recording a new decision on the same item.
