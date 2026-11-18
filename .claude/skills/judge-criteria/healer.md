# Criteria: the healer's fixes

Judged from the diff the healer left and the failing run it started from, never from the healer's reasoning.

- `test-side-defect-fixed`: the defect the fix targets was in the test side (a page object, data or a wait), the
  test passes after the fix, and the failure it started from is gone, not hidden by a skip or a retry.
- `no-expectation-moved-toward-build`: no expected value or assertion changed, weakened or removed to match what the
  build does; a product defect stayed a known-issue proposal and a report.
- `every-fix-explained`: every change in the diff has an explanation that says why it fixes the failure.
