---
"@virtocommerce/test-automation-framework": minor
---

Make the QA agents' project facts safer to start from. `node .claude/checks/project-facts.mts` now refuses a file that
is still the template's (an account in the example domain, the `PROJ` tracker key) and checks it against the repository:
the `npm run` scripts of the commands, the Playwright projects behind `commands.test` and `quality.durationBudgetMs`,
and the `healerPaths` directories. `roleFor.admin` and `commands.lint` are optional, and the agents say what to do
without them. `npx vc-qa-agents init` also writes `.mcp.json` with the pinned Playwright MCP server, the passwords the
template's `.qa/project.json` names, and a `pages/` directory; `browser-secrets.mts` restricts its file with `icacls`
on Windows, or warns. `rank-gaps.mts` marks gaps ordered only by name as `tied`, and the coverage metrics count
`test.skip` and `test.fixme` tests as skipped. The agent prompts allow `not reached: <why>` as the content of an empty
report section, work in a repository with untracked files, and mark every example from the framework's own suite as
not a rule.

An API area that no page uses can now be explored: `introspect.mts` saves the stand's schema without a credential and
`probe.mts` observes anonymous cases with one read-only query or GET, both for `qa-explorer` only. The contract has an
Existing coverage section, Critical flow and Parameters columns, dated references to local reports and snapshots, and
amendments that name their cases and changes; `check --implemented` requires every case id in the title of a test in
a spec file the contract's Verification runs. `reconcile-run.mts --contract` compares the series' real command
(`--project`, `--workers`/`-j`, `--grep`/`-g` in either form) with the contract's Verification, takes one `deviation:`
reason per difference and refuses a report older than the specs it covers. `prove-fails.mts` mutates `toBe(true|false)`,
`.not`, name and member-chain arguments and `arrayContaining`/`objectContaining`, and refuses an assertion in an
`arrange:` step; the judge's verdict records its mechanical and reasoned proofs; `test-shape.mts` counts the helpers a
test calls. The framework rules cover a client suite without `arrange` (a `finally` that never fails the test) and a
shared dataset account (`--workers=1`), and the reviewer takes style only from the repository.

`node .claude/checks/prune.mts` cleans the agents' git-ignored working files under `.qa/`. `/qa`, `/qa-plan` and
`/qa-coverage` run it first with `--fetch --yes`: it removes a contract whose cases are all in test titles of the spec
files its Verification runs, on the default branch of `origin`, read from git without a checkout, with its run record, judge verdict and observed report,
unless its spec files have uncommitted or unpushed changes or an unmerged local branch carries its name. Older
contracts, reports, healer runs and probes are listed and removed only on the person's yes (`--yes --include-stale`);
the knowledge directory and `.local.env` files are never touched. The contract check no longer reads a closing backtick
or period into a dated source path, and asks no date for a directory.

A suite kept as its own npm project in a subdirectory (its own `package.json` and `node_modules`, none at the root)
now works with the agents at the repository root. `project-facts.mts` detects it from `suiteDir` and the files
present and prints `playwright`, the command the agents start Playwright Test with: `npm exec --prefix <suiteDir> --no
-- playwright test --config=<suiteDir>` there, `npx --no playwright test` with or without `--config` as before
elsewhere. The skills, the read-only shell hook, `contract --implemented`, `prove-fails`, `test-shape`, `introspect`
and `probe` use that launcher or the suite's `node_modules`, the facts check reads the suite's `package.json` and
understands `npm --prefix <dir> run <script>`, and `npx vc-qa-agents init <dir>` writes such a suite with the agents
and facts at the root.
