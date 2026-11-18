# Generic QA agents — design

Status: approved 2026-11-18 · design 1.2 of the client-adaptation stage

## Intent

The framework is being handed to clients so they can generate tests with it, and its agents ship with it. The same
agents must work in our own test repository and in a client's test repository without edits. Today's three agents
(`qa-planner`, `qa-automation-expert`, `qa-reviewer`) know only our stand: our store, our users, our frontend, our
code style. Handed over as they are, they would write tests for our stand.

This design makes the agents generic and adds the roles that proved useful in client test suites we studied:
exploring an unfamiliar frontend or API, healing failing tests, an independent judge of the tests, a hand-off file
between planning and implementation, and coverage analysis with priorities.

## Goals

1. Every agent, skill and command reads client-specific facts from the client's configuration and repository, never
   from its own prompt.
2. Two layers of rules: framework rules ship with the agents and are the same everywhere; style and structure rules
   come from the repository the agent writes in.
3. Seven roles: `qa-planner`, `qa-automation-expert`, `qa-reviewer` (generalized), and new `qa-explorer`,
   `qa-healer`, `qa-coverage`, `qa-judge`.
4. One entry, `/qa <task>`, that picks the flow; today's commands stay as shortcuts.
5. A contract file is the only hand-off from planning to implementation; each role runs as a fresh subagent, so
   implementation starts with a clean context.
6. An independent judge of the tests in every flow (and of every role in the evaluation suite), and a definition of
   done that counts skips.
7. A playbook skill for security tests.
8. A knowledge snapshot the agents read before calling live services.
9. An evaluation suite with an independent judge that checks the agents themselves before each release of the
   package, so a prompt change cannot silently make the agents worse for every client at once.

## Non-goals

- Writing to a tracker or wiki: posting plans, creating tasks, publishing a coverage page, filing pipeline-failure
  tickets. These wait for the tracker and code-host adapters (separate design, deferred).
- Where the agents live in a client repository (plugin or copied `.claude/`): a separate open question.
- Framework code: configuration schema (design 1.1), stand profiles and seeding (1.3), extension points (1.4). This
  design lists what it needs from them.
- CI templates.

## Anti-goals

- An agent writes code that bypasses the framework API (raw requests in a spec, its own waits) because the client's
  style allowed it.
- Client facts (hosts, ids, business rules, names) end up in the framework or in our public test repository.
- An agent changes shared-stand state outside what the stand profile allows.
- A skipped test is counted as done without a reason the profile explains.
- The healer makes a test pass by changing an expected value to match the build.
- Any commit, push or outward write without a person asking for it.

## Constraints

- The framework repository is public: prompts and examples stay generic.
- Claude Code scopes tools per agent, and a subagent cannot start another subagent. Orchestration therefore lives in
  commands that run in the main session; agents never orchestrate.
- An agent definition is loaded whole on every dispatch: each stays short, detail goes into skills.
- Designs 1.1, 1.3 and 1.4 are not finished; see "What this needs from other designs".

## Approaches

| Approach | Trade-off | Decision |
|---|---|---|
| **Roles + one entry** — keep the three roles, add explorer, healer and coverage as agents, one `/qa` command routes, a contract file between roles | More files; the router lives in a command | **Chosen** (17–18.11): the reviewer stays independent of the author, each role gets its own tool permissions, a fresh subagent gives the context cut for free |
| One agent with a router over flows | Fewer files, but the author reviews its own work, the prompt grows, and in a client repository it overlaps with the client's own single agent | Rejected |
| Skills only, no new agents | Fewest changes, but exploring and healing need different tools (browser MCP, read-only) and Claude Code grants tools per agent | Rejected |

## Design

### Where client facts come from

| Fact | Today | From now on |
|---|---|---|
| Store, currency, language, installed modules, feature flags, data modes | `STORE_ID` and `store-acme` in agent prompts | the stand profile in `vc-test.config.ts` (1.1, 1.3) |
| Who acts in a test | dataset users `acme_*@acme.com` in prompts | data roles from the profile ("store administrator", "customer of their own"); agents name roles, never accounts |
| Test projects and folders | a fixed table | the repository's Playwright configuration |
| Clients, GraphQL documents, page objects, `arrange` domains, builders | a fixed list of ours | the extension registry (1.4) plus a search of the repository |
| Frontend switches (`QUANTITY_CONTROL`, …) | named in prompts | that frontend's page objects; agents do not know them |
| Typecheck, lint and test commands | our npm scripts | `commands` in the configuration (requested from 1.1) |
| Critical flows used for priority | none | `critical` in the configuration (requested from 1.1) |
| Code style | in prompts | the repository's `CLAUDE.md` and linter configuration |

### Two layers of rules

**Framework rules** live in one skill, `framework-rules`, that every agent reads first. They come from today's
`CLAUDE.md` "Writing tests" and the agents' checklists: layers and imports, `@fixtures` only, `arrange` and cleanup
before the change, deletion proven by id, `requireFields`, `knownIssue` instead of bare `fixme`, `requiresModules` and
`requiresFeatures`, no raw selectors in specs, index waits, `tests/isolated/` for platform-wide changes, respecting
the profile's data modes, no conditionals in specs (table-driven cases). The skill also carries the working
discipline: think before testing, the simplest spec that proves the behaviour, surgical changes, success criteria
that can be checked.

**Style rules** come from the repository: its `CLAUDE.md`, linter and formatter configuration, and neighbouring
files. Our current style items — no code comments, `function` declarations, "frontend" not "storefront" — move out
of the prompts into our test repository's `CLAUDE.md` as the default a client may replace.

A framework rule beats a style rule. In a client repository the client's style beats our default style.

### Roles

| Agent | Does | Never | Tools |
|---|---|---|---|
| `qa-planner` | Turns a ticket, spec, request or an area of existing functionality into a test-case matrix — one formal technique per acceptance criterion, plus edge, negative and regression cases — asks the scope questions the matrix leaves open, writes the contract | writes test code | read, search, write the contract |
| `qa-automation-expert` | Implements the contract and nothing else; runs the definition of done | widens scope; on a change of scope it stops and asks | edit, shell |
| `qa-explorer` (new) | Explores an unfamiliar frontend (pages, selectors, missing test ids, a page-object proposal) and API (schema against the live stand); compares page-object test ids with the frontend source when the source is available; writes a report | writes test code | read, browser MCP, shell (read-only commands) |
| `qa-healer` (new) | Runs failing or flaky specs, classifies each failure (test defect, product defect, stand data, flaky), fixes test-side defects in page objects, data or waits, re-runs, at most three rounds, then escalates | changes an expected value or assertion to match the build; a product defect becomes a `knownIssue` proposal and a report | edit, shell, browser MCP |
| `qa-reviewer` | Checks framework rules (from the skill), style (from the repository), that nothing is left on a shared stand, and the definition of done | fixes anything; it reports | read, shell (read-only) |
| `qa-coverage` (new) | Lists what the stand offers and what the tests cover, and ranks the gaps (below) | writes tests or outward | read, shell (read-only) |
| `qa-judge` (new) | Judges the expert's tests in every flow, and every role's work in the evaluation suite (below) | sees the agent's reasoning; changes the working tree | read, shell (read-only), writes only under `.qa/judge/` |

The reviewer is dispatched fresh with the diff and the contract, never with the author's summary.

Tool limits are enforced, not only stated *(my calls)*: read-only roles get no edit or write tools; their shell is
limited to an allowlist (test listing, git reads, schema reads) by a hook or permission rule, whichever the shipping
form supports. The browser MCP server is registered under one fixed name in every test repository, so agent
definitions can name its tools.

### Entry and flows

`/qa <task>` runs in the main session and picks a flow:

| Request | Flow |
|---|---|
| A ticket, spec or feature | planner → a person approves the contract → expert → reviewer |
| Existing functionality with no ticket: a module, page or API area ("cover the cart"), or a gap from coverage | explorer maps the area, coverage lists what is already tested, then planner → approval → expert → reviewer |
| "Explore …", or the plan needs selectors or endpoints nobody has mapped | explorer, then back to the flow that asked |
| A failing or flaky test | healer, then reviewer when it changed code |
| "Review this branch" | reviewer |
| "What is not covered / what next" | coverage; its gaps can be handed to the planner |
| "Do it end to end" | planner → approval → explorer if needed → expert → healer if red → reviewer |

After the expert, the judge judges the tests before the reviewer starts; after the healer, a code check confirms its
diff changes no expectation.

`/qa-plan`, `/qa-implement` and `/qa-review` stay; `/qa-explore`, `/qa-heal` and `/qa-coverage` are added.

### The contract

`.qa/contracts/<ticket-key-or-slug>.md`, git-ignored. The planner writes it, a person approves it with one question,
the expert receives only its path, the reviewer receives it with the diff. It holds:

- the source (ticket key or spec) and the scope, with what is out of scope and why;
- the case matrix: case, technique, Playwright project, data role, oracle (where the expected value comes from);
- the stand needs: profile, required modules, flags and data roles;
- the building blocks to reuse and to add, known issues, and the verification commands.

When implementation shows the contract is wrong, the expert stops and writes an "Amendments" request; a person
approves it before work continues.

**Existing functionality.** A contract's source is a ticket, a specification or documentation page, an area of
existing functionality, or a gap from `qa-coverage` (added 18.11). Without a ticket there are no acceptance criteria,
so the planner takes the expected behaviour from the documentation sources the configuration lists, the API schemas,
and what the explorer observed on the stand. Every oracle in the cases table carries where it came from: `ticket`,
`doc`, `schema` or `observed`. An oracle that is only `observed` may be a bug the stand already has; the contract
lists those cases separately and a person confirms them at approval, otherwise they are written as characterization
tests and named so. Existing manual test cases in a test-management tool become a source with the tracker adapters.

### The judge

`qa-judge` (decided 18.11) is an independent judge of an agent's work. It is dispatched fresh, receives the output and
that role's criteria — never the agent's reasoning or summary — answers pass or fail per criterion with the evidence
it used, and fails when in doubt. The criteria live in one place per role.

**Where it runs, to keep the cost down** (decided 18.11): in every flow it judges **only the expert's tests**, once per
contract, because nothing else catches a test that cannot fail — it passes and looks green. A failed verdict sends
the tests back to the expert once; a second failure goes to a person. The other roles are already covered more
cheaply in a flow — the contract by a person's approval and its check script, the explorer's selectors by the tests
that use them, the healer by a code check that its diff changes no expectation or expected value, the coverage
ranking by its script — so the judge checks them only in the evaluation suite before a release. Running the test on a
broken copy is done by a script, not by the model, and the judge may run on a cheaper model than the working agents
*(my call)*.

| Work judged | Criteria |
|---|---|
| planner's contract | every acceptance criterion or documented rule became a case or an out-of-scope line with a reason; every oracle names its source; nothing invented |
| expert's tests | every contract case has a test, or a written reason it has none; each test checks the behaviour its case claims; each test fails when that behaviour breaks — proved where possible by breaking the expected value in a throw-away copy and running it; every skip has a reason |
| explorer's report | every selector and operation it lists exists on the stand; nothing invented |
| healer's fixes | the test-side defect is fixed; no expected value or assertion moved toward the build; every fix explained |
| coverage report | each gap is real (no test covers it); the order follows the weights |

The judge proves a test fails on a copy only: a git worktree under `.qa/judge/`, never the working tree. It writes
nothing else.

The reviewer keeps what is not the judge's: framework rules, style, nothing left on a shared stand (cleanup
registered, only data the profile marks `owned` changed), and the definition of done.

### Definition of done

- The changed specs pass on every Playwright project they belong to.
- Typecheck and lint, as the configuration's `commands` name them, are clean.
- Passed plus skipped equals tests times projects, and every skip is explained by `requiresModules`,
  `requiresFeatures`, `knownIssue` or the profile. A silent skip is a failure.
- The reviewer returns APPROVE. It does not take the expert's word for the run: the expert leaves Playwright's JSON
  report under `.qa/runs/<contract>/`, a record the tool wrote, and the reviewer counts tests times projects itself
  with `--list` *(my call)*.
- When the stand is not reachable, the report says the run was not done.

### Coverage and priority (`qa-coverage`)

Read-only; writes a local report under `.qa/reports/`.

1. **What the stand offers:** installed modules and feature flags from the profile; GraphQL operations and REST
   endpoints from the schemas; frontend pages from the frontend's routes where the frontend exposes them.
2. **What is covered:** tests per project and area, and every skipped test with its reason.
3. **Gaps, ranked:** a gap ranks higher when its flow is listed in `critical`, when its module and flag are enabled
   on the stand, and when a UI test has no API test under it. Each gap is written so the planner can take it as a
   task.
4. **Metrics:** today's `generate-coverage-report` counts become a section of this report.

Reconciling with a tracker epic, bug history and publishing a page come with the tracker adapters.

### Knowledge snapshot

`.qa/kb/` in the test repository holds stand facts and the acceptance criteria and specs the agents fetched, each
with its capture date. Agents read the snapshot first, call the live service only when the snapshot cannot answer,
and then update the snapshot. In a public repository the snapshot is git-ignored, because agents fill it with text
from internal tickets; in a client's private repository it is committed *(my call)*.

### Security playbook

A skill, `write-security-test`: access without a session, access with the wrong role, one customer or organization
reaching another's objects (both created with `arrange`), security response headers, and input validation, over
REST and GraphQL.

### Agent evaluation and judge

The agents ship to clients, so a change to a prompt or skill is a release for everyone. An evaluation suite in the
framework repository, `evals/`, runs the agents on fixed tasks before each package release and whenever an agent,
skill or command changes.

**A case** is a task, the repository state it starts from, and what a good result must satisfy. Cases cover every
role, and each role has at least one trap case, where the tempting answer is the wrong one:

| Role | Example case | Trap case |
|---|---|---|
| planner | a ticket with four acceptance criteria → a contract | a criterion that cannot be tested on the stand: the contract must say so, not invent a case |
| automation expert | a contract → specs that pass | a contract case needing a module the stand lacks: the spec must declare `requiresModules`, not drop the case |
| explorer | an unmapped page → selectors and a page-object proposal | a page without test ids: the report must say they are missing, not invent them |
| healer | a test broken by a renamed selector → fixed in the page object | a real product defect: the expected value must stay, a `knownIssue` is proposed |
| reviewer | a diff → a verdict | a diff with planted defects (an assertion that cannot fail, cleanup after the change, a raw selector): each must be caught |
| coverage | a stand and a test set → ranked gaps | a module installed but disabled by a flag: its gap must rank low |

**Checks run in two tiers.** Code checks first, because they are cheap and cannot be argued with: typecheck, lint,
the framework-rule checks, the run result, the skip reconciliation, whether the planted defects were reported. Then
`qa-judge`, the same agent with the same per-role criteria as in the flows, decides what code cannot.

**Results** are kept per release and compared with the previous one. A failed code check blocks the release; a judge
score that drops against the previous release is reported to a person *(my call: the judge informs, it does not
block, until its own verdicts have been checked against people's on a few releases)*. Cases that need a stand run
against our stand; the rest run offline.

Clients adding their own private cases to check the agents on their code comes later.

### What changes in today's files

| File | Change |
|---|---|
| `.claude/agents/qa-planner.md` | drop our store, users and domain list; read `framework-rules` and the configuration; write the contract |
| `.claude/agents/qa-automation-expert.md` | same; its input is the contract path |
| `.claude/agents/qa-reviewer.md` | checklist split into framework and style; the stand check and the definition of done |
| new `qa-judge.md` and its criteria per role | the judge in every flow and in the evaluation suite |
| new `qa-explorer.md`, `qa-healer.md`, `qa-coverage.md` | as above |
| `write-*`, `create-*` skills | literal ids in examples become data roles and dataset reads; our examples stay, marked as this repository's |
| `plan-test-strategy`, `plan-implementation` | the first gains the case matrix with techniques; the second writes the contract |
| commands | add `/qa`, `/qa-explore`, `/qa-heal`, `/qa-coverage`; `/qa-implement` reads the contract file instead of the conversation |
| `generate-coverage-report` | becomes the metrics section of `qa-coverage` |
| `migrate-katalon-module`, `code-review-full` | ours only, not shipped to clients *(my call; packaging decides)* |
| `CLAUDE.md` | framework rules move to the skill; style stays |
| new `evals/` | cases, the code checks, the judge agent and a runner script; results per release |

### What this needs from other designs

- **1.1 configuration:** `commands` (typecheck, lint, test per project), the tracker key pattern (branch names and
  `knownIssue` links only), `critical` flows, the knowledge directory, the browser MCP server the explorer and healer
  use.
- **1.3 stand profile:** modules, flags, data modes and data roles in a form agents can read.
- **1.4 extension points:** a registry agents can read to find a client's clients, page objects and `arrange`
  domains.

### Until 1.1, 1.3 and 1.4 land *(my calls)*

- **One interim file, `.qa/project.json`.** It is JSON so an agent reads it without running code, and it holds the
  fields above with our values: `commands`, `critical`, the knowledge directory, the browser MCP server, and `roles`,
  a map from data role to the dataset account `test.use({ user })` takes today. Its field names are this design's
  proposal to 1.1 and 1.3. Agents read it through one skill, `project-facts`, so a rename later touches one file.
- **Only APIs that exist.** Specs use `test.use({ user })` through the role map and `requiresModules`.
  `requiresFeatures` and the `owned` marks are used once 1.3 adds them; until then the reviewer's stand check verifies that
  cleanup is registered and nothing platform-wide changed outside `tests/isolated/`.
- **Tickets are read by whichever access route the client has, read-only** (decided 18.11). Trackers differ — Jira,
  Azure Boards and others — in key format, in where acceptance criteria live (a Jira custom field or the
  description; Azure Boards' `Microsoft.VSTS.Common.AcceptanceCriteria`), and in how they can be reached. Routes:

  | Route | Example | Masking before the model (decision 5) |
  |---|---|---|
  | the framework's tracker command | adapters design, when built | yes, built in |
  | the provider's CLI | `az boards work-item show`, `gh issue view`, the Atlassian CLI | yes, output piped through the redactor |
  | the provider's REST API | a read call with the token taken by secret reference (decision 4) | yes, response passes the redactor |
  | the provider's MCP server | its read tools | no: the text reaches the model directly |
  | pasted text or a file | any tracker | the person chooses what to paste |

  - The configuration names the tracker kind, the key pattern, the acceptance-criteria field (the adapters design's
    fields) and an **ordered list of allowed routes**; the first that works is used. Our repositories allow every
    route; a client's default allows only masked routes and pasted text until the client switches MCP on *(my
    call)*.
  - One skill, `read-ticket`, is the only place that knows providers and routes. Whatever the route, it writes a
    **ticket card** in the adapters design's normalized model: key, title, type, status, description, acceptance
    criteria, linked issues, URL. Every other agent reads only the card, so provider and route differences stop at
    one step, and the framework's command later becomes one more route without touching the agents.
  - Reading the code host (pull requests, diffs) follows the same pattern: CLI, API, MCP or pasted, one skill, one
    normalized result.
  - The redactor belongs to the adapters design; until it is built, a client's default is pasted text only.
- **Agents edit only files inside the test repository**, never the framework package. A defect in package code
  becomes a report for the framework repository.
- **Accepted against our repository**, plus a scan of every shipped prompt for client facts, plus the evaluation
  suite. A synthetic client repository joins the evaluation suite once 1.4 says where a client's building blocks
  live.

### Relation to the agentic-QA spec

`qa-coverage` and `qa-healer` are the spec's Coverage and Healer agents, first step, and follow its rules:

- Coverage: priority factors — risk, call frequency of the endpoints where telemetry exists, run frequency,
  stability, automation cost — with weights in the client's configuration. The ranking rules above become the
  default weights. The requirement ↔ manual case ↔ test map waits for the tracker adapters.
- Healer: it explains every fix, never edits a test that caught a real defect, decides "flaky" from a series of runs
  whose size is in the configuration, and keeps a separate flaky list. Each area of the application has an autonomy
  level in the configuration: in a low-risk area the healer applies its fix, in a critical one it only proposes it.

## Left to the builder

Skill and file names beyond those named here, prompt wording, how the router phrases its classification, report
formats, how `qa-coverage` lists frontend pages for each kind of frontend, the number of evaluation cases beyond one
normal and one trap case per role, and the runner (a script, or Claude Code's plugin evaluation if the agents ship
as a plugin).
