---
"@virtocommerce/test-automation-framework": minor
---

`npx vc-qa-agents init` is a one-command onboarding: it asks for the URLs, store, logins, tracker and test-id attribute of
your stand (or takes them from flags with `--yes`), writes `.env` and `.qa/project.json`, installs the dependencies at
exact versions with the package's `glob` and `minimatch` overrides, generates the types, runs a first test that only
reads, and ends with a readiness table. `npx vc-qa-agents doctor` prints the table again. The Playwright MCP server starts
through the launcher `.claude/checks/browser-mcp.mts`, which writes the browser secrets from `.env` at each start; an
existing suite switches its `.mcp.json` as the Browser section of the QA agents guide describes. `VERIFY_SSL=false`
holds for the whole run: `scripts/check-platform.ts`, codegen, the first test and the browser server
(`--ignore-https-errors`) accept a certificate they cannot verify.
