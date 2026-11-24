---
"@virtocommerce/test-automation-framework": minor
---

Add the `fixtures` area: `defaultFixtures` returns the Playwright fixtures of a test suite, for `test.extend`, with
clients of the platform and its frontends, users signed in once for each worker, a check that skips tests whose
`modules` are not installed, and browser sessions. Add `FrontendBrowserSessions` and `PlatformBrowserSessions` to the
`auth` area, which start a browser signed in to a frontend or to the admin UI of the platform.
