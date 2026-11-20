# Commercialization audit: current state and recommended architecture

Status: Phase 0 deliverable. Proposed, awaiting owner review. No code, dependency, migration or behavior was changed to produce it.
Date: 2026-11-19
Branch inspected: `feat/guided-setup-discovery` (clean, at 338cffb, version 0.9.0)
Inputs: `CLAUDE.md`, `INVARIANT_CLAUDE_CODE_IMPLEMENTATION_GUIDE.md`, the checked-out code, `docs/specifications/validation-and-governance-v1.md`, `docs/decisions/0001` and `0006`, `site/design.md`.

Where this audit and the guide disagree, the code wins. The corrections are in section 2.

## 1. Summary

- The repo is a pnpm TypeScript monorepo with one app (`apps/cli`) and 19 packages. It has no server, database, auth, billing, telemetry or network client code. Nothing in the CLI or packages calls `fetch`, `node:http` or `node:net` outside tests (the grep found none).
- The site is hand-written static HTML deployed to GitHub Pages. It cannot host an API or authentication. A hosted control plane is a new deployable, not an extension of the site.
- The local engine already has the right seams for the plan. Policies are plain versioned JSON with a Zod schema, compiled into the contract by one function (`compilePolicies`). Validation output already has a stable JSON shape with a contract hash. Both can be reused without change.
- Four real gaps matter more than the guide assumes: no policy precedence or "mandatory" concept, no policy release identity in the contract or report, no report type that spans a validate run with policy provenance, and a licence (FSL-1.1-ALv2) that is not open source. Details in sections 4 and 8.
- Recommendation: add the hosted side as two new apps and a small set of packages, keep the engine untouched, and require ADRs for hosting, identity/database and the cloud/local boundary before Phase 1. Section 7.

## 2. Corrections to the guide's assumptions

| Guide says | Checked-out repo |
|---|---|
| ADRs go in `docs/adr/` | ADRs live in `docs/decisions/` (0001 to 0008, numbered). New ADRs continue at 0009. |
| `pnpm verify` is the gate | Confirmed: `lint`, `typecheck`, `check:boundaries`, `build`, `test` (Biome, tsc, vitest 5). Node 24, pnpm 12.16. |
| Packages named `cloud-*` can simply be added | `scripts/check-boundaries.ts` holds an allow-list of workspace dependencies per package. Each new package must be registered there or CI fails. |
| "Open-core" | `LICENSE` is FSL-1.1-ALv2 (source-available, converts to Apache 2.0 later), copyright Matt Carlucci. Not an OSI licence. Positioning copy must say "source-available" unless the owner decides otherwise. |
| `invariant enforcement report` is a data source for run uploads | It exists (`apps/cli/src/enforcement-report.ts`) but renders the local hook log (`.invariant/enforcement.jsonl`) per agent session. It is not a validate-run report. See section 4. |
| Site is a framework app | `site/` is static HTML plus three build scripts (`site/build/*.mjs`). ADR 0006 proposes Astro Starlight for docs and is still **Proposed**; `site/design.md` is locked. |
| CI deploys the site | `pages.yml` uploads `site/` to GitHub Pages. `ci.yml` ignores `site/**` and `docs/**`. |

## 3. Existing structure

### Repository

- `apps/cli`: the only app. Commands dispatched in `apps/cli/src/cli.ts`: init, source, analyze, compile, components, tokens, patterns, discover, setup, browser, candidates, conflicts, validate, verify, rules, review, policy, export, mcp, hook, preview, enforcement, agent. Config is `invariant.config.json` (Zod strict schema in `config.ts`).
- Compiler: `compiler-core`, `compiler-ir`, `compiler-react|vue|angular|storybook|tokens`, `reconciliation`, `semantic-engine`, `artifact-generator`.
- Contract and read API: `contract`, `contract-query`.
- Governance and validation: `governance` (decisions, policies, patterns files and compilers), `validation` (rules, policy rules, pattern rules, reports), `browser-verify`.
- Agent surface: `mcp` (read-only), `agent-kit`, `plugins/`, `plugin-src/`.
- Shared: `shared` (canonical stringify, `sha256Hex`, `hashJson`, diagnostics, severity).
- Tooling: Biome 2.6.4, TypeScript 5.9.3 strict, vitest 5, Zod 4.6.7 (the only runtime validation library in packages; Ajv is a root dev dependency only), release-please for the npm CLI, GitHub Actions.

### Deployment and infrastructure today

- Site: GitHub Pages via `.github/workflows/pages.yml`. Static only.
- CLI: published to npm by release-please (`release.yml`). Plugins are versioned and released separately (`docs/releasing.md`).
- No hosting account, secret store, database, auth provider, billing provider, error monitoring or analytics is configured. A search for supabase, stripe, postgres, prisma, drizzle, telemetry, posthog and sentry found only a mention in `docs/submission/anthropic-directory.md`.

### What exists versus what the plan needs

| Capability | Exists | Missing |
|---|---|---|
| Local compile, validate, verify, policy, review, hook, MCP | Yes | Nothing for MVP |
| Policy file schema and compiler | Yes (`policiesFileSchema`, `compilePolicies`) | Release identity, mandatory flag, precedence |
| Machine-readable validate output | Yes (`toJson`, SARIF, GitHub) | Cloud payload schema, sanitizer |
| Enforcement log | Yes, local only | Upload mapping |
| Accounts, organizations, roles | No | All of it |
| Project tokens | No | All of it |
| HTTP client, retry, offline cache | No | All of it |
| Signing and release verification | No (content hashing exists in `shared` and `contract`) | Signing, key management |
| Audit log | Local decisions file only | Server audit events |
| Dashboard | No | All of it |
| Billing | No | Deferred to Phase 6 |

## 4. Interfaces to reuse

### Policies (central distribution target)

- `packages/governance/src/policies.ts`: `POLICIES_FILE`, `policiesFileSchema`, `PoliciesFile`, `parsePolicies(text)`, `compilePolicies(draft, file, source)`. A policy has `id`, `name`, `statement`, `severity`, `enforcement` (`block|warn|report-only`), a mandatory `approval {approvedBy, approvedAt, role?, reference?}`, and a `rule` (`policyRuleSchema` from `packages/validation/src/policy.ts`, seven kinds).
- `compilePolicies` adds each policy and constraint to the contract and rejects an id already present (`governance.policy-id-taken`). It never changes existing entries.
- Wiring point: `apps/cli/src/pipeline.ts` around lines 177 to 187 reads the policies file and calls `compilePolicies`. Pattern files follow the same shape (`patterns-file.ts`, `compilePatterns`).
- Consequence: a cloud release can be materialized as a `PoliciesFile` (and `PatternsFile`) and fed through this exact path. No second policy engine. The hosted app would depend on `parsePolicies`, `policiesFileSchema` and `policyRuleSchema` only to validate content at publish time.
- Important: `validate` reads only the compiled contract, so a policy that is not compiled in is not enforced. A fetched release must be applied at `compile` time. That changes the contract content hash when org policy changes, which is correct and should be documented.

### Validation output (report upload source)

- `packages/validation/src/report.ts`: `RunSummary` (files, errors, warnings, info, componentsChecked, `patternRules {pass, fail, warning, notVerifiable, skipped}`, optional `interactionEvidence`), `Violation extends Finding`, and `toJson(violations, summary, contractHash, evaluations)` returning `{contractHash, summary, violations, evaluations}`.
- `Finding` (`validate-usage.ts`): `code`, `severity`, `message`, `path?`, `file?`, `line?`, `column?`, `subject?`, `source?`, `basis` (`discovered|documented|inferred|approved|heuristic`), `confidence?`, `policy?`, `suggestion?`.
- This already carries the distinctions the dashboard must keep: pass, fail, warning, skipped, not verifiable, and fact basis. The upload payload should map from this shape and add run context. It should not invent a score.
- Privacy fields to handle: `message` and `suggestion` are free text built from component and prop names and can embed values from source; `file` is project-relative in validate output but must be checked; `path` and `source` can reference contract locations. A sanitizer is required (section 6).
- `toJson` carries no CLI version, branch, commit, policy release or timestamps. Those must come from the new reporting layer, not from changing `toJson`, to keep the existing JSON format backward compatible.

### Enforcement log

- `apps/cli/src/enforcement-log.ts`: `eventSchema` v1 (time, session, file, outcome `blocked|warned|passed`, findings capped at 10, text clipped to 200 chars, `omitted`, `checked`). Findings and paths only, never file contents. Written by the user-installed hook; MCP stays read-only (ADR 0003).
- This is agent-session telemetry, not CI. It is a possible second run type (`enforcement`) later. It is not needed for the first pilot, whose CI value comes from `validate`.

### Contract and hashing

- `packages/contract`: `computeContentHash`, `contract.integrity.contentHash`. `packages/shared`: `canonicalStringify`, `sha256Hex`, `hashJson`. Release canonicalization and content hashes should reuse these so client and server cannot disagree.

### Governance and approvals

- `packages/governance/src/decisions.ts`: decisions file, `addDecision`, `applyDecisions`, `governance.approvers` allow-list. The spec states plainly that authorization is asserted, not authenticated (open decision U14). The cloud product is the first place real identity and authorization could back an `approval`. That is a genuine product claim and should be designed deliberately, not implied.

## 5. Gaps that need design before Phase 4

1. **No precedence model.** There is no concept of a mandatory policy. The only weakening paths today are `validation.rules` in config (severity or off per rule code) and not including a policy. `policy` rules take severity from the policy itself, which is good, but rule-code overrides can still silence built-in rules. Requirement "organization policy cannot be weakened" needs a defined layering in the compile step and a diagnostic, for example `governance.mandatory-overridden`. This touches `packages/governance` and the pipeline. It is a contract-adjacent behavior change and needs an ADR plus tests, per `CLAUDE.md`.
2. **No release identity.** Nothing records which policy bundle or release produced a policy. The `approval.reference` field could carry a release id as a stopgap, but that overloads a human field. Proposed: record release id and hash in `extensions.invariant` on the compiled policy, and expose it in the report. This is a contract change (versioned, schema, fixtures) and must follow the contract-change checklist.
3. **Approver identity.** A policy needs `approvedBy` and `approvedAt`. Cloud approval should populate these from the authenticated approver, with the release id as `reference`, so no schema change is required for the basic case.
4. **Offline cache location.** The CLI uses project-relative `.invariant/` (the log) and `invariant/` output. It does not use a home or XDG directory. The cache should follow that convention (project-local `.invariant/cache/`) unless ADR says otherwise.
5. **Signing.** Nothing exists. Node's built-in `node:crypto` supports Ed25519, so no new dependency is needed on the client.
6. **Config surface.** `invariant.config.json` is a Zod strict object. A `cloud` block is an additive, optional field. It must hold only non-secret metadata (project id, URL). Tokens come from the environment only.
7. **Package boundaries.** New packages must be added to `ALLOWED` in `scripts/check-boundaries.ts`, and `docs/architecture/system-architecture.md` rules extended.

## 6. Recommended architecture (smallest viable)

### Principle

Keep a hard line. The existing packages never import the new ones. The CLI imports a small client package behind one new command group. Removing the new packages leaves the product exactly as it is today.

### Proposed layout

```text
apps/
  cli/            existing. Adds `cloud` and `report` command groups only.
  web/            new. Dashboard and API in one deployable (see ADR candidates).
packages/
  cloud-contracts/   Zod schemas and versions for API payloads, report payload, release envelope. Depends on: shared.
  cloud-client/      HTTP, retry with backoff and jitter, token from env, policy cache, signature and hash verification.
                     Depends on: shared, cloud-contracts. Used only by apps/cli.
  reporting/         validate JSON (and later enforcement events) to sanitized cloud report. Depends on: shared, validation (types only), cloud-contracts.
  cloud-domain/      Organization, role, token, release rules as pure functions. No framework or database imports.
                     Depends on: shared, cloud-contracts, governance (parsePolicies for publish-time validation).
```

`apps/api` is not recommended. One app that serves both the dashboard and the API is enough for the MVP, per the guide's "avoid premature microservices". Keep the domain logic in `cloud-domain` so it can be split out later without a rewrite.

### Option evaluation

Nothing here is decided. Each row needs owner approval via ADR.

| Decision | Options | Notes and recommendation |
|---|---|---|
| Hosting | (a) Vercel or Netlify, (b) Cloudflare Workers/Pages, (c) Fly.io or Render container | The existing GitHub Pages site cannot run server code. The site can stay on Pages. Recommend a managed platform with a Node 24 runtime and a secret store. Choose by the DB and auth pairing below. No evidence in the repo favors one. |
| Database | Managed PostgreSQL (Supabase, Neon, RDS) | Postgres matches the relational, audit-oriented data and RLS support. Provider is open. Keep SQL migrations as plain files so the provider is replaceable. |
| Auth | Supabase Auth, Clerk, Auth.js, WorkOS | Supabase Auth is the natural pair only if Supabase is also the database. If the database is elsewhere, Auth.js or Clerk is simpler than splitting. The guide's SSO deferral means WorkOS can wait. Recommend deciding database and auth together. |
| Web framework | Next.js, SvelteKit, Astro, Hono with a small SPA | Repo is all TypeScript and Node. ADR 0006 already proposes Astro for docs, which is a different concern. A single TypeScript full-stack framework is enough. No evidence for a specific one; the choice should favor a small dependency tree. |
| ORM or query layer | None (SQL plus Zod), Drizzle, Kysely | Recommend a thin typed query layer over raw SQL migrations. The repo prefers few dependencies (`CLAUDE.md`: "No unnecessary dependencies"). |
| Tenant isolation | RLS plus server checks | Recommended by the guide. RLS applies when the browser may talk to the database; if all access goes through the server with a pooled connection, set the tenant per transaction or enforce in a repository layer with tests. Decide per provider. |
| Signing | Ed25519 via `node:crypto`; keys in a managed KMS or platform secret | Public key distributed with the CLI config or fetched and pinned. Rotation: key id in the envelope, multiple accepted public keys. |
| Billing | Stripe | Deferred. No Phase 1 to 5 dependency. |
| Email | None for MVP | Invitations can be link-based at first. |

### Local/cloud boundary

- Local owns: compile, verify, validate, policy interpretation, enforcement outcome, contract, evidence. The server never computes a validation result.
- Cloud owns: identity, tenancy, tokens, release storage and signing, run storage, audit.
- Two outbound calls only, both optional: `GET` the assigned release; `POST` a sanitized run. Both go through `cloud-client`. No other network use is added.
- No source code, snippets, env vars or absolute paths leave the machine. Contract content is also not uploaded in the MVP; only its hash and schema version.
- A failed fetch or upload never changes the exit code of `compile`, `verify` or `validate` unless a strict flag is set.

### Token model

- Format: `inv_<env>_<random 32 bytes base64url>`. Prefix stored in clear for lookup and display; only a SHA-256 hash (of a high-entropy secret, so no slow KDF is needed) is stored. Shown once.
- Scoped to one project and the scopes `report:write` and `policy:read`. Revocation sets `revoked_at`; rotation creates a new token then revokes the old one.
- The server derives organization and project from the token or the session. It never trusts a client-supplied `organizationId`.
- Tokens are read from `INVARIANT_TOKEN` only. They are never written to `invariant.config.json`, the cache or logs. Error output redacts them.

### Tenant isolation

- Every tenant table carries `organization_id`. Session access goes through membership; token access goes through the token's project.
- Defense in depth: RLS where the database enforces it, plus authorization in `cloud-domain` and a repository layer that requires an actor context to run any query.
- Tests: for every endpoint, cross-organization read and write attempts by ID substitution; token A against project B; revoked token; expired session.

### Report data minimization

- A new `reporting` mapping builds the payload from `toJson` output. Whitelist fields rather than strip them.
- Always sent: schema version, project id, commit, branch, PR number, run URL, CLI version, contract content hash and contract schema version, policy release id and hash (when applied), run type, timestamps, status, counts by severity and rule code, the five pattern-rule outcome counts, interaction evidence counts, idempotency key.
- Opt-in (organization setting, enforced server side and echoed to the client): per-finding rows with project-relative `file` and `line`.
- Never sent: `message` and `suggestion` text by default (they can embed names and values from source), absolute paths, anything outside the whitelist. When findings are enabled, send a rule code plus a bounded, control-character-stripped message, and test that no field exceeds its cap.
- Findings must keep `basis` and `severity`, and not-verifiable and skipped counts must reach the dashboard as separate states.
- Idempotency key: hash of project id, commit SHA, run type, contract hash and policy release id, plus the CI run id when present. Server returns the existing run on a duplicate.

### Immutable policy releases

- A release is the canonical JSON (`canonicalStringify`) of an envelope holding a `PoliciesFile`, an optional `PatternsFile`, and metadata. Its hash is `sha256` over that canonical form.
- The envelope fields in the guide are a good start. Proposed adjustments: include `signingKeyId`, keep `organizationId` and `workspaceId` inside the signed bytes, and keep `signature` outside the hashed bytes.
- Database enforces immutability (no UPDATE or DELETE on published releases; revoke grants or use a trigger) and the app never exposes an edit route. A change creates a new release version.
- The client verifies in order: envelope schema, signature against a known key, content hash, organization and workspace match the connected project, `schemaVersion` supported, then `parsePolicies` on the content. Any failure rejects the bundle and keeps the previous cache.
- Approval writes an audit event with the approver, time and reason, and populates each policy's `approval` block from that approver.

### Offline behavior

- Cache the last verified release in `.invariant/cache/` with retrieval time. Report the release id, version and retrieval time at compile, and in uploaded reports. State "cached" explicitly when offline.
- Default: a network failure falls back to the cache and warns; never fails. Strict mode (`--strict-cloud` or config) fails when no valid release is available or the cache is older than a configured maximum age.
- With no cache and no network, compile proceeds with local policies only and says so.

## 7. Proposed ADRs (not yet written)

Continue the numbering in `docs/decisions/`. None is accepted; each needs owner review.

1. **0009 Hosted control plane: app structure and hosting.** One `apps/web` deployable versus separate API; platform choice; how it stays out of CLI packaging and release-please (`exclude-paths`).
2. **0010 Identity and database.** Provider pair, tenancy enforcement (RLS versus repository layer), migration tooling, backups.
3. **0011 Cloud/local boundary and data minimization.** The two outbound calls, payload whitelist, opt-in findings, strict mode, no-source rule.
4. **0012 Policy releases: signing, hashing, precedence and contract metadata.** Envelope, key management and rotation, mandatory-policy layering, recording release identity in `extensions.invariant`. This one is a contract change and must include the checklist from `CLAUDE.md` (schema, runtime validation, migration, fixtures, versioning).
5. **0013 Licensing and positioning.** FSL-1.1-ALv2 versus the "open-core" wording; what runs under which licence for the hosted code.

Also decide before Phase 1: where hosted code lives (this repo versus a private repo). The guide assumes this repo. A private repo for `apps/web` would keep the engine repo clean and avoid shipping hosted code under FSL, at the cost of cross-repo schema sharing through a published `cloud-contracts` package.

## 8. Implementation breakdown by phase

Scope follows the guide. Only Phase 1 and later touch code; each phase waits for owner review.

### Phase 0 (this document)

- Add: `docs/commercialization/CURRENT_STATE_AUDIT.md`.
- Next: write ADRs 0009 to 0013 as Proposed, then get approval.

### Phase 1: foundation

- New: `apps/web/` (framework per ADR 0009), `packages/cloud-contracts/`, `packages/cloud-domain/`.
- New: SQL migrations for `organizations`, `memberships`, `workspaces`, `projects` (location per ADR 0010).
- Edit: `scripts/check-boundaries.ts` (`ALLOWED` entries), `pnpm-workspace.yaml` only if a new glob is needed (`apps/*` already covers `apps/web`), `docs/architecture/system-architecture.md` (boundary rules), CI workflow (a separate job for web, so `ci.yml` path filters do not block it).
- Edit: `release-please-config.json` `exclude-paths` and `scripts/build-npm.ts` check, so `apps/web` never enters the npm package.
- Tests: role matrix in `cloud-domain`; cross-tenant integration tests against a real database in CI.
- No change to `apps/cli` or any existing package.

### Phase 2: tokens and report ingestion

- New: `packages/reporting/`, `packages/cloud-client/`; migrations for `project_tokens`, `validation_runs`, `validation_findings`.
- Edit: `apps/cli/src/cli.ts` (register `cloud` and `report` commands), new `apps/cli/src/commands-cloud.ts`, `config.ts` (optional `cloud` block), help text, `docs/specifications/cli-v1.md`.
- Reuse: `toJson` output from `packages/validation/src/report.ts` as input; `hashJson` for idempotency.
- Tests: sanitizer whitelist and length caps, retry and backoff, 401 and 4xx non-retry, offline default exit code, golden payload fixture, duplicate upload, cross-project token.

### Phase 3: dashboard

- Edit: `apps/web/` screens. No new packages. Counts must reconcile with stored runs; pass, fail, warning, skipped and not-verifiable stay separate states.
- Read `site/design.md` first: it applies to `site/`, and the guide wants the dashboard to follow it. Decide whether the dashboard reuses tokens from the static site CSS or imports a copy, and update `site/design.md` first if it gains a new surface, as the file requires.

### Phase 4: policy registry and sync

- New: migrations for `policy_bundles`, `policy_releases`, `project_policy_assignments`, `audit_events`; signing module in `cloud-domain` and verification in `cloud-client`.
- Edit: `packages/governance` (precedence and mandatory handling, release metadata), `packages/contract` (schema, JSON Schema, version bump, migration, fixtures) per ADR 0012; `apps/cli/src/pipeline.ts` (accept fetched policies alongside the local file); new `invariant cloud pull` command.
- Tests: tamper, wrong tenant, unsupported schema, unsigned bundle; precedence matrix; offline fallback; golden fixtures for the changed contract.

## 9. Risks

- **Contract change in Phase 4** is the only item that touches the core. It is the highest-risk step and gets its own ADR.
- **Claiming authenticated approval.** The local spec says approval is asserted. Cloud approval is stronger but only inside the cloud. The product copy and `site/design.md` rule against unshipped-feature marketing apply.
- **Free-text findings** can leak source details. The default of sending no message text is deliberate.
- **Licence mismatch** with "open-core" language. Resolve before any public pricing or positioning.
- **Operational load on a solo maintainer**: auth, backups, tenant isolation and a support runbook are real ongoing costs. The guide's pilot-first approach limits this.
- **Release process coupling**: release-please versions one root package. Hosted code must be excluded so a dashboard change does not cut a CLI release.

## 10. Open questions for the owner

1. Hosted code in this repo (FSL) or a separate private repo?
2. Is the licence staying FSL-1.1-ALv2? If so, drop "open-core" from copy.
3. Hosting and database preferences, or constraints (existing accounts, budget, data residency)?
4. Should cloud-approved policies be allowed to populate `approval.approvedBy` in the compiled contract, and is the ADR 0012 contract change acceptable?
5. Is the first pilot GitHub-only? That affects the metadata fields (PR number, run URL) the CLI can detect from CI environment variables without extra configuration.
6. Default for per-finding file paths: strictly opt-in per organization (recommended), or per project?
7. Domain for the app (the guide uses `app.invariant-ui.com`) and who controls DNS today?
8. Is the dashboard allowed to depend on a UI framework, given the design rules ban webfonts, external requests and decorative effects?

## 11. Verification performed

- Read-only inspection only: file listings, source reads, grep. No build, test or install was run.
- The baseline quality gate (`pnpm verify`) was not run in this phase. Its result is therefore not recorded here; it should be run before Phase 1 begins so regressions can be attributed.
- Unverified: whether any hosting or DNS accounts exist outside the repo, and whether the `invariant-ui/cli` public repo matches this branch.
