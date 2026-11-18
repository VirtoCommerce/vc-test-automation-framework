# QA Heal

Spawn the `qa-healer` agent once to run failing or flaky specs, classify each failure, and fix the test-side
defects in the healer paths of the project facts (page objects and data, never a spec). It never changes an expected
value or an assertion to match the build.

`$ARGUMENTS` is a spec file, a test title, or a run record path (`.qa/runs/<contract>/`). No arguments: ask for
one.

1. Record a baseline and a fingerprint first: `node qa/expectation-guard.mts --snapshot` prints a git tree id of the
   working tree, untracked files included; `node qa/expectation-guard.mts --repo-fingerprint` prints one sha of
   `.git/config`, `.git/info/`, `.git/hooks/` and `.qa/project.json` (it only reads; it is yours, the healer may not
   run it). Dispatch the agent fresh with the target and that baseline id, nothing else. It re-runs, classifies (test
   defect, product defect, stand data, flaky), fixes page objects, data and waits, and stops after three rounds.
2. Recompute the fingerprint and run the guard, both from the baseline's own copy of `qa/`, never from the working
   tree (the healer could have changed it):
   ```shell
   dir=$(mktemp -d) && git -c core.fsmonitor=false archive <baseline tree id> qa | tar -x -C "$dir"
   test "$(node "$dir/qa/expectation-guard.mts" --repo-fingerprint)" = "<fingerprint>" || { echo "repository config changed by the healer"; rm -rf "$dir"; exit 1; }
   node "$dir/qa/expectation-guard.mts" --base=<baseline tree id>; code=$?; rm -rf "$dir"; test $code -eq 0
   ```
   "repository config changed by the healer": stop there, show it to the person, and run no other git command or
   test in the repository until they have looked; a planted hook or config line runs with their rights. Any other
   non-zero result means "not clean" (the recipe exits 1 whatever the guard's own code, so a baseline without `qa/`
   also gives it). Findings listed (a file outside the healer paths, a changed expectation, an added skip, wait
   or similar): stop, show them to the person, and do not offer a review. No finding listed: the guard could not run;
   report "not checked", never clean, and do not offer a review.
3. Present what it fixed, what it classified as a product defect (a `knownIssue` proposal, never a patch), and what
   it escalated. A stand that was not reachable is "not done".

When code changed and the guard is clean, end with:
```
Heal complete. Run /qa-review to review the changes.
```
