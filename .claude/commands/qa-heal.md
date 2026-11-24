# QA Heal

Spawn the `qa-healer` agent once to run failing or flaky specs, classify each failure, and fix the test-side
defects in the healer paths of the project facts (page objects and data, never a spec). It never changes an expected
value or an assertion to match the build.

`$ARGUMENTS` is a spec file, a test title, or a run record path (`.qa/runs/<contract-name>/`). No arguments: ask for
one.

1. Record a baseline and a fingerprint first: `node .claude/checks/expectation-guard.mts --snapshot` prints a git
   tree id of the working tree, untracked files included; `node .claude/checks/expectation-guard.mts
   --repo-fingerprint` prints one sha of `.git/config`, `.git/info/`, `.git/hooks/`, the directory `core.hooksPath`
   names and `.qa/project.json` (it only reads; it is yours, the healer may not run it). When `--repo-fingerprint`
   exits non-zero or prints anything but 64 lowercase hexadecimal characters (a configuration file under a healer
   path, for one), show the person "fingerprint could not be computed:" followed by its stderr line, and do not
   dispatch the healer. Then store the guard recipe as the baseline holds it:
   `GIT_NO_LAZY_FETCH=1 git --no-replace-objects -c core.fsmonitor=false cat-file blob <baseline tree id>:.claude/skills/heal-tests/guard-recipe.md`
   prints it; keep that text, and when it prints nothing, do not dispatch the healer. Dispatch the agent fresh with
   the target and that baseline id, nothing else. It re-runs, classifies (test defect, product defect, stand data,
   flaky), fixes page objects, data and waits, and stops after three rounds.
2. Run the recipe you stored in step 1 word for word: its shell block with the baseline id and the fingerprint of
   step 1, and what each outcome means. Never read `.claude/skills/heal-tests/guard-recipe.md` from the working tree
   after the heal: the healer runs test code, which can rewrite any file, the recipe included. A guard that is not
   clean ends here: show it to the person and offer no review.
3. Present what it fixed, what it classified as a product defect (the test stays failing; a person files the
   ticket and adds its link as an `issue` annotation, never a patch), and what it escalated. A stand that was not
   reachable is "not done".

The heal belongs to a run record when the target is a run record `.qa/runs/<contract-name>/` and
`.qa/contracts/<contract-name>.md` exists. For a spec file or a test title, look before step 1: count the run records
whose `list.<project>.json` names the spec (or, for a title, a spec that holds it). Exactly one, and
`.qa/contracts/<contract-name>.md` exists: the heal belongs to it. Otherwise (zero, several, or no contract file): say
so; the review runs without a contract.

When the heal belongs to a run record, do what `/qa` does after a heal: the recipe's "After a Clean Guard", word for
word, with that record and contract.

When code changed and the guard is clean, end with the review command, its `healer:` line filled in from the guard
recipe (the baseline id, then the `healed tree`). Put the contract path first only when that re-run reconciled with
exit 0 on every project; otherwise leave it out, since `/qa-review` would reconcile a record that is not the healed one:
```
Heal complete. Run /qa-review <contract path or nothing> healer: <baseline tree id> <new tree id> to review the changes.
```
Without a clean guard, name no `healer:` line and offer no review.
