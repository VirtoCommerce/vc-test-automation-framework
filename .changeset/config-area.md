---
"@virtocommerce/test-automation-framework": minor
---

Add the parts of a test suite's Playwright config to the `core` area: `defaultRunOptions`, `defaultUse`,
`defaultReporters`, `apiProject`, `e2eProject` and `DESTRUCTIVE_TAG`. The default report is Allure, and
`allure-playwright` is an optional peer dependency. Add `isCi` to the `core` area.
