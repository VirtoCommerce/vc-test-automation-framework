---
"@virtocommerce/test-automation-framework": minor
---

Add `SecretMaskingReporter` to the `core` area, and add it to `defaultReporters` after the Allure reporter. When the
run ends, it masks registered secrets in the text files of the Allure results and of the projects' output
directories, such as a password in the title of a `locator.fill` step. Traces, screenshots and videos are not masked.
