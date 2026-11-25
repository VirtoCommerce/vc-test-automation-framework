---
"@virtocommerce/test-automation-framework": minor
---

Add the `fixtures` area: `defaultFixtures` returns the Playwright fixtures of a test suite, for `test.extend`, with
clients of the platform and its frontends, users signed in once for each worker, a check that skips tests whose
`modules` are not installed, and browser sessions. Add `BrowserSessions` to the `auth` area, which starts a browser
signed in to an application with a sign-in strategy: `oauthLocalStorage` for the Virto Commerce frontend,
`cookieSignIn` for an application with a cookie session, `platformAdminSignIn` for the admin UI of the platform, or a
strategy of the test suite's own, passed to `defaultFixtures` as `frontendSignIn`.
