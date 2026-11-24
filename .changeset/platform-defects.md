---
"@virtocommerce/test-automation-framework": minor
---

Add `PLATFORM_DEFECT_TAG` and the `SKIP_PLATFORM_DEFECTS` environment variable to the `core` area. A test of a known
platform defect keeps failing by default; with `SKIP_PLATFORM_DEFECTS` on, `defaultRunOptions` leaves it out along
with the destructive tests, so a defect a ticket tracks does not fail the CI of the platform and its modules.
