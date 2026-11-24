# Criteria: the expert's tests

Judged from the contract, the diff and the files it touches, never from the expert's reasoning or summary. The
judge proves a test fails with `node .claude/checks/prove-fails.mts`; the model does not run the test on a broken
copy itself.

- `case-has-test`: every case row of the contract has a test, or a written reason why it has none (an approved
  amendment, a requirement the stand cannot meet). A case under `## Platform defects` has a test like any other.
  List each case with its test or its reason.
- `checks-claimed-behaviour`: each test asserts the behaviour its case claims, on the data role and project the
  case names, against the expected value of the case's oracle. A test that asserts something easier or different is
  a fail. A test of a platform-defect case asserts the correct behaviour, not what the build does.
- `fails-when-behaviour-breaks`: each test fails when that behaviour breaks. Prove it where the script can change a
  literal of the assertion (evidence: the `prove-fails` output with `failed: true` and the line it changed); where
  none can, say why and reason from the assertion. A bound (`toBeGreaterThan`, `toBeLessThan` and their `OrEqual`
  forms) and a line with more than one assertion are never proved by the script: reason from the assertion, and pass
  a bound only when its limit is the oracle's and the tightest the case allows. A test of a case under
  `## Platform defects` already fails on the defect: its failure line, showing the oracle's value against the
  build's, is the evidence. An assertion that cannot fail (a tautology, a check on a value the test set itself, a
  missing await, an assertion on something that is always present) is a fail.
- `skip-has-reason`: every skip carries a reason a reader can act on: the `modules` option (the missing or older
  module) or a stand-profile condition. A silent skip, and a `test.skip`, `test.fixme` or `test.fail` in a spec, is a
  fail.
