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
