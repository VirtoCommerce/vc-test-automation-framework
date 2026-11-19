# QA Heal

Spawn the `qa-healer` agent once to run failing or flaky specs, classify each failure, and fix the test-side
defects in the healer paths of the project facts (page objects and data, never a spec). It never changes an expected
value or an assertion to match the build.

`$ARGUMENTS` is a spec file, a test title, or a run record path (`.qa/runs/<contract-name>/`). No arguments: ask for
one.

1. Record a baseline and a fingerprint first: `node .claude/checks/expectation-guard.mts --snapshot` prints a git tree id of the
   working tree, untracked files included; `node .claude/checks/expectation-guard.mts --repo-fingerprint` prints one sha of
   `.git/config`, `.git/info/`, `.git/hooks/`, the folder `core.hooksPath` names and `.qa/project.json` (it only reads; it is yours, the healer may not
   run it). When `--repo-fingerprint` exits non-zero or prints anything but 64 lowercase hexadecimal characters (a
   configuration file under a healer path, for one), show the person "fingerprint could not be computed:" followed by
   its stderr line, and do not dispatch the healer. Dispatch the agent fresh with the target and that baseline id, nothing else. It re-runs, classifies (test
   defect, product defect, stand data, flaky), fixes page objects, data and waits, and stops after three rounds.
2. Run the guard recipe in `.claude/skills/heal-tests/guard-recipe.md` word for word: its shell block with the
   baseline id and the fingerprint of step 1, and what each outcome means. A guard that is not clean ends here: offer
   no review.
3. Present what it fixed, what it classified as a product defect (a `knownIssue` proposal, never a patch), and what
   it escalated. A stand that was not reachable is "not done".

The heal belongs to a run record when the target is a run record `.qa/runs/<contract-name>/` and
`.qa/contracts/<contract-name>.md` exists. When the target is a spec file or a test title (take the spec that holds
the test), look before step 1 for run records under `.qa/runs/<contract-name>/` whose `list.<project>.json` names that
spec. Exactly one of them with its `.qa/contracts/<contract-name>.md`: the heal belongs to that record. None, or more
than one: say so to the person; the review then runs without a contract and skips the definition of done.

When the heal belongs to a run record, do what `/qa` does after a heal: the recipe's "After a Clean Guard", word for
word, with that record and contract.

When code changed and the guard is clean, end with the review command, its `healer:` line filled in from the guard
recipe (the baseline id, then the `healed tree`). Put the contract path first only when that re-run reconciled with
exit 0 on every project; otherwise leave it out, since `/qa-review` would reconcile a record that is not the healed one:
```
Heal complete. Run /qa-review <contract path or nothing> healer: <baseline tree id> <new tree id> to review the changes.
```
Without a clean guard, name no `healer:` line and offer no review.
