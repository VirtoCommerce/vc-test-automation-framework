---
"@virtocommerce/test-automation-framework": minor
---

Make `npx vc-qa-agents init` a one-command onboarding. In a terminal it asks for the backend and frontend URLs, the
store, the administrator, customer and other customer logins and passwords, the tracker and the test-id attribute,
writes `.env` and `.qa/project.json`, installs the dependencies, generates the types, runs the first test and ends with a
readiness table. Without a terminal, or with `--yes`, it takes the values from flags (`--backend-url`, `--frontend-url`,
`--store-id`, `--admin-login`, `--customer`, `--other-customer`, `--tracker`, `--key-pattern`, `--test-id-attribute`)
and from the shell; passwords are never flags, and passwords from the shell reach `.env` only with `--save-passwords`.
`--skip-verify` makes no request. The new `npx vc-qa-agents doctor` prints the same table at any time and exits with 1
when a row fails.

The Playwright MCP server of the agents starts through the launcher `.claude/checks/browser-mcp.mts`, which writes
`.qa/browser-secrets.local.env` from `.env` at each start, so the manual `browser-secrets.mts` step is gone (the script
stays as a manual tool) and the server no longer exits when that file is missing. `init` writes the new `.mcp.json`; an
existing suite that starts `@playwright/mcp` directly keeps its file, and `npx vc-qa-agents` prints the entry to switch
to the launcher.

The suite template installs `@biomejs/biome` and the other dependencies at the exact version the package was tested
with, copies the package's `glob` and `minimatch` overrides into the suite's `package.json`, and reads the test-id
attribute from the optional `FRONTEND_TEST_ID_ATTRIBUTE` (`data-test-id` by default). Its first test only reads the
current user; the test that creates a user is `create-user.example.ts`. Generating the REST types from a platform that
does not answer reports the URL and the cause once.
