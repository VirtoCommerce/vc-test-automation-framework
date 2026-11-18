# Criteria: the expert's tests

Judged from the contract, the diff and the files it touches, never from the expert's reasoning or summary. The
judge proves a test fails with `node qa/prove-fails.mts`; the model does not run the test on a broken copy itself.

- `case-has-test`: every case row of the contract has a test, or a written reason why it has none (an approved
  amendment, a known issue, a requirement the stand cannot meet). List each case with its test or its reason.
- `checks-claimed-behaviour`: each test asserts the behaviour its case claims, on the data role and project the
  case names, against the expected value of the case's oracle. A test that asserts something easier or different is
  a fail.
- `fails-when-behaviour-breaks`: each test fails when that behaviour breaks. Prove it where the script can change a
  literal of the assertion (evidence: the `prove-fails` output with `failed: true` and the line it changed); where
  none can, say why and reason from the assertion. An assertion that cannot fail (a tautology, a check on a value the
  test set itself, a missing await, an assertion on something that is always present) is a fail.
- `skip-has-reason`: every skip, `fixme` and expected failure carries a reason a reader can act on, a
  `requiresModules`, `requiresFeatures`, `knownIssue` or profile condition. A silent skip is a fail.
