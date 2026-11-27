---
"@virtocommerce/test-automation-framework": patch
---

`TokenClient.signIn` waits while another sign-in of the same user in the same store runs, also in another process on
the machine, such as another Playwright worker. The platform returns a 500 status for concurrent sign-ins of the same
user.
