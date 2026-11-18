# Generic QA Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the framework's QA agents generic — every client fact comes from the repository, not the prompt — and add
the explorer, healer and coverage roles, the `/qa` entry, the contract hand-off, the review gate, ticket reading over
any route, a security playbook and an evaluation suite with a judge.

**Architecture:** Agents, skills and commands stay Markdown under `.claude/`. The few decisions that must be exact
(project facts, contract shape, run reconciliation, read-only shell, gap ranking, ticket card, eval comparison) are
small TypeScript modules in a new `qa/` folder, run with `node` and unit-tested in the `unit` Playwright project.
Agents call them instead of reasoning about them.

**Tech Stack:** TypeScript (Node 22 type stripping, `.mts`), Playwright Test (`unit` project), Biome, Claude Code
agents / skills / commands / hooks, `claude -p` for the evaluation runner.

**Spec:** `docs/superpowers/specs/2026-11-18-generic-qa-agents-design.md`

## Global Constraints

- The repository is public: no client hosts, ids, names or business rules in any file; examples stay generic.
- Framework rules beat style rules; a client's style beats our default style.
- Agents never commit, push or write to a tracker, wiki or code host; nothing changes shared-stand state outside the
  profile.
- The healer never changes an expected value or assertion to match the build.
- A skipped test without a reason is a failure.
- Every agent definition is at most 8,000 characters *(the "short" of the spec, made checkable)*.
- `qa/` modules import nothing outside `qa/` and `core/`; add `qa/**` to `biome/layers.json` with that rule.
- Code style: CLAUDE.md "Code style" (no comments, `function` declarations, no `any`, no `!`).
- Work on a branch from `origin/dev` named `feat/VCST-6837-generic-qa-agents`; commit locally, push only when a person
  asks. Coordinate with the repository split before merging: `.claude/` and `qa/` may move to the tests repository.

## Review Focus

1. **A client repository with no or a broken `.qa/project.json`** — agents stop and name the missing field; they never
   fall back to our values. Test: Task 1 `rejects a file missing commands.typecheck`.
2. **A route that fails while reading a ticket** (CLI absent, API 401, MCP not connected) — the next allowed route is
   tried, then pasted text; a card is never half-filled. Test: Task 3 `a card without acceptance criteria says so`.
3. **Command chaining slipped into a read-only shell** (`git diff; rm -rf x`, `$(…)`, `>` redirect, `&&`) — rejected.
   Test: Task 7 `rejects chained, substituted and redirected commands`.
4. **A run that lost tests** (a worker crashed, a project was filtered) — listed tests missing from the report count
   as failures, not passes. Test: Task 6 `a listed test missing from the report fails the run`.
5. **A contract amended during implementation** — only an amendment with an `Approved:` line counts; an unapproved one
   fails the contract check. Test: Task 4 `an amendment without approval fails`.

---

### Task 1: Project facts

**Files:**
- Create: `qa/project-facts.mts`, `.qa/project.json`, `.claude/skills/project-facts/SKILL.md`
- Modify: `.gitignore`, `biome/layers.json`, `tsconfig.json` (include `qa/**`)
- Test: `tests/unit/qa/project-facts.test.ts`

**Interfaces:**
- Produces:
  - `type Route = "command" | "cli" | "api" | "mcp" | "paste"`
  - `type ProjectFacts = { tracker: { kind: string; keyPattern: string; acceptanceCriteriaField?: string; routes: Route[] }; docSources: { name: string; route: Route; where: string }[]; commands: { typecheck: string; lint: string; test: Record<string, string> }; critical: string[]; knowledgeDir: string; roles: Record<string, string>; coverageWeights: { risk: number; callFrequency: number; runFrequency: number; stability: number; cost: number }; flakyRunSeries: number; autonomy: Record<string, "apply" | "propose"> }`
  - `parseProjectFacts(json: unknown): ProjectFacts` — throws `Error("project.json: <path> <problem>")`
  - `readProjectFacts(path = ".qa/project.json"): ProjectFacts`
  - `DEFAULT_CLIENT_ROUTES: readonly Route[] = ["paste"]`
  - CLI: `node qa/project-facts.mts` prints the validated JSON, exit 1 with the error otherwise.

- [ ] **Step 1: Write the failing tests**

```ts
test("parses our project.json", () => {
  const facts = readProjectFacts(".qa/project.json");
  expect(facts.roles["store administrator"]).toBe("acme_store_administrator@acme.com");
  expect(facts.tracker.routes).toEqual(["command", "cli", "api", "mcp", "paste"]);
});
test("rejects a file missing commands.typecheck", () => {
  expect(() => parseProjectFacts({ ...VALID, commands: { lint: "x", test: {} } })).toThrow("project.json: commands.typecheck is missing");
});
test("rejects an unknown route", () => {
  expect(() => parseProjectFacts(withRoutes(["email"]))).toThrow("project.json: tracker.routes[0] is not a route");
});
test("rejects a key that is not a valid regular expression", () => { /* keyPattern "([" */ });
test("rejects a flaky run series below 2", () => { /* flakyRunSeries: 1 */ });
```

- [ ] **Step 2: Run** `npm run test:unit -- tests/unit/qa/project-facts.test.ts` — Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `qa/project-facts.mts` with the signatures above; `.qa/project.json` with our values:
  tracker `jira`, key pattern `^VCST-\d+$`, all five routes, commands from `package.json` scripts, the role map from
  `dataset/data/users/` ("store administrator", "store employee", "store manager", "purchasing agent", "other store
  employee"), weights `1` each, `flakyRunSeries: 5`, autonomy `{ "*": "propose" }`, `knowledgeDir: ".qa/kb"`,
  `docSources`: the public Virto Commerce documentation (`api` route, `https://docs.virtocommerce.org`) and the module
  READMEs (`paste`/files).
  `.gitignore`: `.qa/contracts/`, `.qa/runs/`, `.qa/reports/`, `.qa/kb/`. The skill says: run the CLI first; stop and
  report its error when it fails; read roles, commands and critical flows only from its output.
- [ ] **Step 4: Run** the same command — Expected: PASS; `npm run typecheck && npm run check` clean.
- [ ] **Step 5: Commit** `feat(VCST-6837): project facts file and reader for the agents`

### Task 2: Framework rules apart from style

**Files:**
- Create: `.claude/skills/framework-rules/SKILL.md`
- Modify: `CLAUDE.md` ("Writing tests" moves to the skill; "Code style" stays and is marked as this repository's
  default style)

**Interfaces:**
- Produces: the skill name `framework-rules`, read first by every agent (Tasks 4–13).

- [ ] **Step 1: Write the skill** with exactly the framework rules the spec lists ("Two layers of rules"), plus the
  working discipline (think first, simplest spec, surgical changes, checkable success), the knowledge-snapshot read
  order (snapshot in `facts.knowledgeDir` first, the live service only when it cannot answer, then update the snapshot
  with the capture date) and the precedence line. Nothing from "Code style".
- [ ] **Step 2: Rewrite `CLAUDE.md`** "Writing tests" as one paragraph pointing to the skill; keep "Code style".
- [ ] **Step 3: Verify** each bullet of the old "Writing tests" appears in the skill exactly once:
  `git diff --word-diff CLAUDE.md` read against the skill. Expected: no rule dropped.
- [ ] **Step 4: Commit** `docs(VCST-6837): framework rules skill, style stays in CLAUDE.md`

### Task 3: Ticket card and `read-ticket`

**Files:**
- Create: `qa/ticket-card.mts`, `.claude/skills/read-ticket/SKILL.md`, `.claude/skills/read-ticket/providers.md`
- Test: `tests/unit/qa/ticket-card.test.ts`

**Interfaces:**
- Consumes: `ProjectFacts` (Task 1)
- Produces:
  - `type TicketCard = { key: string; title: string; type: string; status: string; description: string; acceptanceCriteria: string[] | "none found"; links: { key: string; relation: string }[]; url: string; route: Route; capturedAt: string }`
  - `parseTicketCard(json: unknown, facts: ProjectFacts): TicketCard`
  - `writeTicketCard(card: TicketCard, dir: string): string` → `<dir>/tickets/<key>.json`
  - CLI: `node qa/ticket-card.mts check <file>`

- [ ] **Step 1: Write the failing tests**: `accepts a full card`; `rejects a key that does not match keyPattern`;
  `a card without acceptance criteria says so` (an empty list is rejected, `"none found"` accepted);
  `rejects a route the facts do not allow`.
- [ ] **Step 2: Run** `npm run test:unit -- tests/unit/qa/ticket-card.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the module. Write the skill: try `facts.tracker.routes` in order, first that answers wins;
  never invent fields; check the card with the CLI before writing it. `providers.md` holds per kind and route the read
  call and where acceptance criteria live: Jira (configured custom field, else description), Azure Boards
  (`Microsoft.VSTS.Common.AcceptanceCriteria`), GitHub Issues (body); routes CLI (`az boards work-item show`,
  `gh issue view`, Atlassian CLI), REST, MCP read tools. Unknown kind ⇒ `paste`. Add
  `.claude/skills/read-change/SKILL.md` for the code host on the same pattern (routes `gh pr view` / `gh pr diff`,
  `az repos pr show`, REST, MCP, paste) with one result written to `.qa/kb/changes/<id>.md`: id, title, state, base
  and head branches, changed files, the diff path, URL.
- [ ] **Step 4: Run** the tests — Expected: PASS.
- [ ] **Step 5: Commit** `feat(VCST-6837): ticket card and read-ticket over any allowed route`

### Task 4: Contract and the planner

**Files:**
- Create: `qa/contract.mts`, `.claude/skills/plan-implementation/contract-template.md`
- Modify: `.claude/agents/qa-planner.md`, `.claude/skills/plan-test-strategy/SKILL.md`,
  `.claude/skills/plan-implementation/SKILL.md`, `.claude/commands/qa-plan.md`
- Test: `tests/unit/qa/contract.test.ts`

**Interfaces:**
- Consumes: `framework-rules`, `project-facts`, `read-ticket`
- Produces:
  - `checkContract(markdown: string, roles?: string[]): string[]` — empty when valid; each problem one line; with
    `roles`, every data role in the cases table must be one of them
  - Required sections: `## Source` (first line `ticket: <key>`, `doc: <link>`, `area: <name>` or `gap: <id>`),
    `## Scope`, `## Out of scope`, `## Cases` (table columns `Case | Technique | Project | Data role | Oracle`, every
    Oracle cell starting with `ticket:`, `doc:`, `schema:` or `observed:`), `## Stand needs`, `## Building blocks`,
    `## Known issues`, `## Verification`; `## Observed only` listing every case whose oracle is only `observed:`, each
    marked `confirmed by <who>` or `characterization`; optional `## Amendments` whose every entry has an
    `Approved: <who>, <date>` line
  - CLI: `node qa/contract.mts check <file>`; contracts live at `.qa/contracts/<key-or-slug>.md`

- [ ] **Step 1: Write the failing tests**: `accepts the template filled in`; `names each missing section`;
  `rejects a cases table without the Technique column`; `an amendment without approval fails`;
  `a data role not in the facts fails`; `an oracle without its source fails`;
  `an observed-only case missing from the Observed only section fails`; `accepts an area source with no ticket`.
- [ ] **Step 2: Run** `npm run test:unit -- tests/unit/qa/contract.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the module and the template. Rewrite `qa-planner.md` (≤ 8,000 chars): no store, users or
  domain list; read `framework-rules`, `project-facts`, the card from `read-ticket`; for an area of existing
  functionality with no ticket, the explorer's report, the coverage report and `facts.docSources` instead; strategy =
  one formal technique per acceptance criterion (or per documented rule) plus edge, negative and regression cases;
  every oracle names its source; ask the open scope questions; write the contract;
  run the check; stop for one approval. `plan-test-strategy` gains the case matrix; `plan-implementation` writes the
  contract; `/qa-plan` passes the contract path on.
- [ ] **Step 4: Run** the tests — Expected: PASS. Dry run: `/qa-plan VCST-<any open ticket>` in this repo writes a
  contract that `node qa/contract.mts check` accepts.
- [ ] **Step 5: Commit** `feat(VCST-6837): contract hand-off written by a generic planner`

### Task 5: Generic automation expert and writing skills

**Files:**
- Modify: `.claude/agents/qa-automation-expert.md`, `.claude/skills/write-rest-api-test/SKILL.md`,
  `write-graphql-test/SKILL.md`, `write-e2e-test/SKILL.md`, `create-rest-client/SKILL.md`,
  `create-graphql-layer/SKILL.md`, `create-ui-layer/SKILL.md`, `.claude/commands/qa-implement.md`

**Interfaces:**
- Consumes: contract path (Task 4), `ProjectFacts.roles` and `commands` (Task 1)
- Produces: a run record at `.qa/runs/<contract-name>/report.json` (Playwright JSON reporter:
  `PLAYWRIGHT_JSON_OUTPUT_FILE=<path> <commands.test[project]> --reporter=list,json`) used by Task 6.

- [ ] **Step 1: Rewrite the agent** (≤ 8,000 chars): input is the contract path only; read `framework-rules` and
  `project-facts`; identities through `test.use({ user: facts.roles[role] })`; on a scope change stop and append an
  unapproved amendment; definition of done per the spec, leaving the run record.
- [ ] **Step 2: Generalize the six skills**: literal ids in examples become dataset reads or roles; keep our examples,
  headed "Example from this repository".
- [ ] **Step 3: `/qa-implement`** takes the contract path, refuses a contract that fails the check.
- [ ] **Step 4: Verify**: dry run on the Task 4 contract — specs written, `report.json` present, typecheck and check
  clean.
- [ ] **Step 5: Commit** `feat(VCST-6837): automation expert works from the contract only`

### Task 6: Run reconciliation

**Files:**
- Create: `qa/reconcile-run.mts`
- Test: `tests/unit/qa/reconcile-run.test.ts` (fixtures: small `--list --reporter=json` and run JSON files in
  `tests/unit/qa/fixtures/`)

**Interfaces:**
- Produces:
  - `type RunVerdict = { expected: number; passed: number; explainedSkips: number; failures: { test: string; project: string; why: "failed" | "flaky" | "missing from the report" | "skipped without a reason" }[] }`
  - `reconcileRun(listed: unknown, report: unknown): RunVerdict` — a skip is explained when it carries a `known issue`
    annotation or a skip annotation with a non-empty description
  - CLI: `node qa/reconcile-run.mts <list.json> <report.json>`, exit 1 when `failures` is not empty

- [ ] **Step 1: Write the failing tests**: `all passed`; `a known-issue expected failure counts as passed`;
  `a module skip with its reason is explained`; `a bare skip fails`; `a flaky test fails`;
  `a listed test missing from the report fails the run`.
- [ ] **Step 2: Run** `npm run test:unit -- tests/unit/qa/reconcile-run.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** keyed on title path + project name from the two JSON shapes.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(VCST-6837): reconcile listed tests against the run`

### Task 7: Reviewer and read-only shell

**Files:**
- Create: `qa/readonly-shell.mts`, `.claude/hooks/readonly-shell.mts`
- Modify: `.claude/agents/qa-reviewer.md`, `.claude/skills/review-test-code/SKILL.md`, `.claude/skills/review-pr/SKILL.md`,
  `.claude/commands/qa-review.md`, `.claude/settings.json`
- Test: `tests/unit/qa/readonly-shell.test.ts`

**Interfaces:**
- Consumes: `checkContract` (Task 4), `reconcileRun` (Task 6)
- Produces: `isReadOnlyCommand(command: string): boolean`; allowlist: `npx playwright test --list …`,
  `git diff|log|show|status …`, `node qa/<module>.mts …` for the modules of Tasks 1, 3, 4, 6, 8, 12; read-only agent names
  `qa-reviewer`, `qa-explorer`, `qa-coverage`, `qa-judge`.

- [ ] **Step 1: Write the failing tests**: `allows git diff with a path`; `allows the list command`;
  `rejects chained, substituted and redirected commands` (`;`, `&&`, `||`, `|`, `$(`, backticks, `>`, `<`);
  `rejects anything not on the list`.
- [ ] **Step 2: Run** `npm run test:unit -- tests/unit/qa/readonly-shell.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the module. First check, with the claude-code-guide agent, whether agent frontmatter
  `tools` accepts Bash patterns; if yes, restrict there; otherwise the PreToolUse hook (registered in
  `.claude/settings.json`) denies a Bash call from a read-only agent when `isReadOnlyCommand` is false. Read-only
  agents list no Edit or Write tools.
- [ ] **Step 4: Rewrite the reviewer** (≤ 8,000 chars): dispatched with the diff and contract path only; the
  checklist split into "Framework rules" (from the skill) and "Style" (from the repository); the stand check (cleanup
  registered, only `owned` data changed; until 1.3: nothing platform-wide outside `tests/isolated/`); the definition
  of done with `node qa/reconcile-run.mts` on its own `--list` output and the run record. Whether a test checks its
  case is the judge's (Task 8), not the reviewer's. Output format unchanged.
- [ ] **Step 5: Run** the tests — Expected: PASS. Dry run: review the Task 5 branch; a planted `waitForTimeout` and a
  cleanup registered after the change are both reported.
- [ ] **Step 6: Commit** `feat(VCST-6837): reviewer stand check, definition of done, enforced read-only shell`

### Task 8: Judge in every flow

**Files:**
- Create: `.claude/agents/qa-judge.md`, `.claude/skills/judge-criteria/SKILL.md` and one file per role in it
  (`planner.md`, `expert.md`, `explorer.md`, `healer.md`, `coverage.md`, criteria from the spec's table),
  `qa/judge-verdict.mts`, `qa/prove-fails.mts`
- Test: `tests/unit/qa/judge-verdict.test.ts`, `tests/unit/qa/prove-fails.test.ts`

**Interfaces:**
- Consumes: `isReadOnlyCommand` (Task 7; add `node qa/prove-fails.mts` and `node qa/judge-verdict.mts` to the
  allowlist and let `qa-judge` write only under `.qa/judge/`)
- Produces:
  - `type JudgeVerdict = { role: "planner" | "expert" | "explorer" | "healer" | "coverage"; subject: string; criteria: { name: string; pass: boolean; evidence: string }[]; verdict: "pass" | "fail" }`
  - `checkJudgeVerdict(json: unknown, role: JudgeVerdict["role"]): string[]` — every criterion of that role's file
    present, evidence non-empty, `verdict` is `"pass"` only when every criterion passes
  - verdict file: `.qa/runs/<contract-or-slug>/judge-<role>.json`
  - `proveFails(spec: string, title: string, patchFile: string): Promise<{ failed: boolean; output: string }>` — a
    git worktree under `.qa/judge/<id>`, applies the patch, runs that one test with the project's test command,
    removes the worktree; never touches the working tree. CLI: `node qa/prove-fails.mts <spec> <title> <patch>`

- [ ] **Step 1: Write the failing tests**: `a verdict missing a criterion fails the check`; `pass with a failed
  criterion fails the check`; `empty evidence fails the check`; `proveFails leaves the working tree unchanged`
  (`git status --porcelain` identical before and after); `proveFails reports failed: true for a patch that breaks
  the expected value` (fixture: a unit-project spec in `tests/unit/qa/fixtures/`).
- [ ] **Step 2: Run** `npm run test:unit -- tests/unit/qa/judge-verdict.test.ts tests/unit/qa/prove-fails.test.ts`
  — Expected: FAIL.
- [ ] **Step 3: Implement** both modules; write the judge agent (≤ 8,000 chars, fresh, receives the output path and
  its role's criteria file only, never the agent's reasoning, evidence per criterion, fails when in doubt, uses
  `prove-fails` for the expert's tests where a patch to the expected value can be written; `model: sonnet` in its
  frontmatter) and the criteria files. In a flow it judges only the expert's tests (Task 9); the other criteria files
  serve the evaluation suite (Task 15).
- [ ] **Step 4: Run** the tests — Expected: PASS. Dry run: judge the Task 5 tests; the verdict file passes
  `checkJudgeVerdict`, and a planted assertion that cannot fail is judged `fail` with `prove-fails` evidence.
- [ ] **Step 5: Commit** `feat(VCST-6837): independent judge of every agent's work`

### Task 9: `/qa` entry and the new commands

**Files:**
- Create: `.claude/commands/qa.md`, `qa-explore.md`, `qa-heal.md`, `qa-coverage.md`

**Interfaces:**
- Consumes: agents of Tasks 4, 5, 7, 8, 10, 11, 12.

- [ ] **Step 1: Write `/qa`**: the flow table of the spec ("Entry and flows"); it runs in the main session and
  dispatches each role as a fresh subagent with paths, never summaries; contract approval is one question; after the
  expert it dispatches `qa-judge` with role `expert` once per contract and checks the verdict with
  `node qa/judge-verdict.mts`; a `fail` goes back to the expert once with the verdict, a second `fail` stops and shows
  both verdicts to the person; after the healer it runs `node qa/expectation-guard.mts` (Task 11) and stops on a
  finding. No judge for the other roles in a flow.
- [ ] **Step 2: Write the three shortcuts**, each one dispatch.
- [ ] **Step 3: Verify**: `/qa explore the cart page` dispatches the explorer; `/qa review this branch` the reviewer.
- [ ] **Step 4: Commit** `feat(VCST-6837): /qa entry and explore, heal, coverage commands`

### Task 10: Explorer

**Files:**
- Create: `.claude/agents/qa-explorer.md`, `.claude/skills/explore-frontend/SKILL.md`,
  `.claude/skills/explore-api/SKILL.md`

**Interfaces:**
- Produces: a report at `.qa/reports/explore-<slug>.md` with sections `Pages`, `Selectors`, `Missing test ids`,
  `Page-object proposal` (frontend) or `Operations`, `Schema vs live` (API).

- [ ] **Step 1: Write the agent** (≤ 8,000 chars, read-only tools plus the browser MCP server registered as
  `playwright`): never writes code; never invents a test id it did not see; compares page-object test ids with the
  frontend source when the facts point to it.
- [ ] **Step 2: Write the two skills** (frontend: pages, selectors in the framework's priority, missing ids; API:
  schema operations against live answers, read-only calls only).
- [ ] **Step 3: Verify**: `/qa-explore` on one frontend page writes the report with all four sections; no file outside
  `.qa/reports/` changed (`git status`).
- [ ] **Step 4: Commit** `feat(VCST-6837): read-only explorer for frontend and API`

### Task 11: Healer

**Files:**
- Create: `.claude/agents/qa-healer.md`, `.claude/skills/heal-tests/SKILL.md`, `qa/expectation-guard.mts`
- Test: `tests/unit/qa/expectation-guard.test.ts`

**Interfaces:**
- Consumes: `facts.flakyRunSeries`, `facts.autonomy` (Task 1), `reconcileRun` (Task 6)
- Produces: `.qa/reports/heal-<slug>.md` (one entry per failure: class, evidence, fix or proposal, why),
  `.qa/reports/flaky.md`, and `findChangedExpectations(diff: string): { file: string; line: string }[]` — every
  removed or changed line in a `*.spec.ts` that holds `expect(`, a `toBe…`/`toEqual`/`toHave…` matcher, or a value in
  an `assert:` step; CLI `node qa/expectation-guard.mts` reads `git diff` of the working tree, exit 1 on a finding.

- [ ] **Step 0: Write the failing guard tests**: `a changed toBe value is found`; `a removed expect line is found`;
  `a changed locator in a page object is not a finding`; `an added test is not a finding`. Run
  `npm run test:unit -- tests/unit/qa/expectation-guard.test.ts` — Expected: FAIL; implement; run — Expected: PASS.
- [ ] **Step 1: Write the agent and skill** (the skill ends with the guard; a finding undoes that fix): classify each failure (test defect, product defect, stand data, flaky —
  flaky only after `flakyRunSeries` runs); fix test-side defects only, at most three rounds, then escalate; apply a fix
  where the area's autonomy is `apply`, otherwise propose; explain every fix; never touch an expected value; a product
  defect becomes a `known-issues.json` proposal in the report.
- [ ] **Step 2: Verify** on two planted failures: a renamed selector is fixed in the page object; a changed expected
  price is classified as a product defect and left untouched.
- [ ] **Step 3: Commit** `feat(VCST-6837): conservative healer with autonomy per area`

### Task 12: Coverage and priority

**Files:**
- Create: `qa/rank-gaps.mts`, `.claude/agents/qa-coverage.md`, `.claude/skills/coverage-analysis/SKILL.md`
- Delete: `.claude/commands/generate-coverage-report.md` (its steps move into the skill's "Metrics" section)
- Test: `tests/unit/qa/rank-gaps.test.ts`

**Interfaces:**
- Consumes: `facts.coverageWeights`, `facts.critical`
- Produces:
  - `type Gap = { area: string; surface: "graphql" | "rest" | "frontend"; name: string; critical: boolean; enabledOnStand: boolean; uiWithoutApi: boolean; factors?: Partial<Record<keyof ProjectFacts["coverageWeights"], number>> }`
  - `rankGaps(gaps: Gap[], weights: ProjectFacts["coverageWeights"]): (Gap & { score: number })[]` sorted by score
    descending, ties by name; a gap not enabled on the stand ranks below every enabled one.

- [ ] **Step 1: Write the failing tests**: `critical outranks non-critical`; `a module disabled by a flag ranks
  last`; `weights change the order`; `ties sort by name`.
- [ ] **Step 2: Run** `npm run test:unit -- tests/unit/qa/rank-gaps.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the module; write the agent (read-only) and skill: inventory (installed modules from the
  `modules` setup project's `installed-modules.json`, GraphQL operations and REST endpoints from the schemas, frontend
  routes where exposed), coverage from `--list`, gaps ranked with `node qa/rank-gaps.mts`, report
  `.qa/reports/coverage-<date>.md` with a "Metrics" section.
- [ ] **Step 4: Run** the tests — Expected: PASS. Dry run: `/qa-coverage` writes a report whose first gap is a
  critical flow.
- [ ] **Step 5: Commit** `feat(VCST-6837): coverage analysis with weighted gap ranking`

### Task 13: Security playbook

**Files:**
- Create: `.claude/skills/write-security-test/SKILL.md`; Modify: `.claude/agents/qa-automation-expert.md` (skill table)

- [ ] **Step 1: Write the skill**: no session, wrong role, one customer or organization reaching another's object
  (both from `arrange`), security headers, input validation; REST and GraphQL; expected errors with
  `toBeHttpError` / `toBeGraphqlError`.
- [ ] **Step 2: Verify**: `/qa-implement` on a one-case contract "a customer cannot read another customer's order"
  produces a passing GraphQL spec.
- [ ] **Step 3: Commit** `feat(VCST-6837): security test playbook`

### Task 14: Prompt scan

**Files:**
- Create: `qa/scan-prompts.mts`, `qa/ours-only.json` (`["migrate-katalon-module", "code-review-full"]`)
- Test: `tests/unit/qa/scan-prompts.test.ts`

**Interfaces:**
- Produces: `scanPrompts(root: string, facts: ProjectFacts, extraTerms?: string[]): { file: string; line: number; finding: string }[]`
  — over `.claude/agents|skills|commands` minus `ours-only.json` and minus lines under an "Example from this
  repository" heading: role accounts and the store id from the facts, `https?://` hosts other than `localhost` and
  documentation hosts, terms from `qa/client-terms.local.txt` (git-ignored), agent files over 8,000 characters.

- [ ] **Step 1: Write the failing tests** on a fixture folder: `finds a role account`; `finds a host`;
  `ignores ours-only files`; `ignores example sections`; `flags a long agent file`; and
  `the shipped prompts are clean` over the real repository.
- [ ] **Step 2: Run** `npm run test:unit -- tests/unit/qa/scan-prompts.test.ts` — Expected: FAIL, then after Step 3
  only the real-repository test may fail; fix the prompts it names.
- [ ] **Step 3: Implement** the module; add `qa/client-terms.local.txt` to `.gitignore`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `test(VCST-6837): shipped prompts carry no client facts`

### Task 15: Evaluation suite

**Files:**
- Create: `evals/cases/<role>/<case>/case.json` (planner, expert, explorer, healer, reviewer, coverage — one normal
  and one trap each, the spec's table), `evals/run.mts`, `evals/compare.mts`, `evals/results/.gitkeep`
- Test: `tests/unit/qa/evals.test.ts`

**Interfaces:**
- Produces:
  - `type EvalCase = { id: string; role: string; trap: boolean; prompt: string; startRef: string; codeChecks: ("typecheck" | "lint" | "reconcile" | "contract" | "planted-defects")[]; plantedDefects?: string[]; judgeCriteria: string[] }`
  - `type EvalResult = { caseId: string; codeChecks: Record<string, boolean>; judge: Record<string, boolean>; evidence: string }`
  - `compareResults(previous: EvalResult[], current: EvalResult[]): { blocking: string[]; judgeDrops: string[] }` —
    any failed code check is blocking; a judge criterion that passed before and fails now is a drop
  - `evals/run.mts --cases <glob> --out evals/results/<version>.json`: per case, a git worktree at `startRef`, the
    role via `claude -p --output-format json`, the code checks, then `qa-judge` with the output and criteria only

- [ ] **Step 1: Write the failing tests**: `parses a case`; `a failed code check blocks`; `a judge drop is reported,
  not blocking`; `a new case has no drop`.
- [ ] **Step 2: Run** `npm run test:unit -- tests/unit/qa/evals.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the modules and the twelve cases; the judge step reuses `qa-judge` and the role's
  criteria file from Task 8, so a case's `judgeCriteria` only adds case-specific lines.
- [ ] **Step 4: Run** the tests — Expected: PASS. Then `node evals/run.mts --cases "evals/cases/reviewer/*"` — Expected:
  a results file; the trap case's planted defects all reported.
- [ ] **Step 5: Commit** `feat(VCST-6837): agent evaluation suite with an independent judge`

### Task 16: Documentation

**Files:**
- Modify: `README.md` (new "Agents" section: roles, `/qa`, `.qa/` layout, `project.json` fields, routes, the fixed
  `playwright` MCP name, how to run evals), `REFINEMENTS.md` (what waits for designs 1.1, 1.3, 1.4)

- [ ] **Step 1: Write both sections.**
- [ ] **Step 2: Verify**: `npm run typecheck && npm run check && npm run test:unit` all clean; the scan test passes.
- [ ] **Step 3: Commit** `docs(VCST-6837): agents guide`

### Task 17: Test quality gates

**Files:**
- Create: `qa/test-shape.mts`, `qa/test-duration.mts`
- Modify: `qa/project-facts.mts` + `.qa/project.json` (new `quality` block), `qa/readonly-shell.mts` (allow the two new
  CLIs for read-only agents), `.claude/agents/qa-automation-expert.md` (stable series), `.claude/agents/qa-reviewer.md`
  (shape and duration gates), `README.md` (the `quality` fields)
- Test: `tests/unit/qa/test-shape.test.ts`, `tests/unit/qa/test-duration.test.ts`, `tests/unit/qa/project-facts.test.ts`

**Interfaces:**
- Consumes: `ProjectFacts` (Task 1), the per-project run records and `reconcileRun` with `--repeat-each` (Tasks 5–6),
  `@babel/parser` (declared in Task 8)
- Produces:
  - `ProjectFacts.quality: { maxSteps: number; maxLines: number; maxExpects: number; maxNesting: number; maxConditionals: number; stableSeries: number; durationBudgetMs: Record<string, number>; slowdownRatio: number }`;
    our values: 8, 60, 12, 3, 0, 3, `{ restapi: 15000, graphql: 15000, "e2e-frontend": 90000, "e2e-backend": 120000 }`, 1.5
  - `checkTestShape(source: string, file: string, limits: ProjectFacts["quality"]): { test: string; finding: string }[]`;
    CLI `node qa/test-shape.mts <spec>…` (exit 1 on a finding)
  - `checkDurations(report: unknown, project: string, quality: ProjectFacts["quality"], previous?: unknown): { test: string; finding: string }[]`;
    CLI `node qa/test-duration.mts <report.json> <project> [<previous report.json>]` (exit 1 on a finding)

- [ ] **Step 1: Write the failing tests**: `a test over maxSteps is reported`; `an if statement in a test is reported
  when maxConditionals is 0`; `a table-driven loop's body counts once`; `a test within limits gives nothing`;
  `a test over its project's budget is reported`; `a test 1.6× slower than its previous run is reported`; `a project
  without a budget is not judged on budget`; `project.json without quality is rejected`.
- [ ] **Step 2: Run** them — Expected: FAIL.
- [ ] **Step 3: Implement** the modules (steps = `test.step` calls; nesting = block depth inside the test body; a
  `for … of ROWS` loop is not a conditional); extend the facts; the expert runs new and changed specs with
  `--repeat-each=<quality.stableSeries> --retries=0` into its run record (reconcile already fails a failing repetition);
  the reviewer runs both CLIs and reports a finding as Critical; both CLIs are read-only and allowlisted.
- [ ] **Step 4: Run** the tests — Expected: PASS; `npm run typecheck && npm run check` clean; reviewer and expert
  stay ≤ 8,000 characters.
- [ ] **Step 5: Commit** `feat(VCST-6837): shape, stable-series and duration gates for new tests`
