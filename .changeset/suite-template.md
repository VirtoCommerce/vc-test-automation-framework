---
"@virtocommerce/test-automation-framework": minor
---

Add `npx vc-qa-agents init`, which writes a test suite that runs into an empty directory: the Playwright config with
the `restapi`, `graphql` and `e2e-frontend` projects, the environment schema, the fixtures, `arrange` with a first
domain, GraphQL and REST type generation, a first test, `CLAUDE.md` and the scripts. It installs the peer
dependencies, Chromium and the QA agents with a `.qa/project.json` for the suite, and never overwrites a file. See
Getting started.
