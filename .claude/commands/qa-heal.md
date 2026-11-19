# QA Heal

Spawn the `qa-healer` agent once to run failing or flaky specs, classify each failure, and fix the test-side
defects in the healer paths of the project facts (page objects and data, never a spec). It never changes an expected
value or an assertion to match the build.

`$ARGUMENTS` is a spec file, a test title, or a run record path (`.qa/runs/<contract-name>/`). No arguments: ask for
one.

1. Record a baseline and a fingerprint first: `node .claude/checks/expectation-guard.mts --snapshot` prints a git tree id of the
   working tree, untracked files included; `node .claude/checks/expectation-guard.mts --repo-fingerprint` prints one sha of
   `.git/config`, `.git/info/`, `.git/hooks/`, the folder `core.hooksPath` names and `.qa/project.json` (it only reads; it is yours, the healer may not
   run it). When the fingerprint refuses because git reads a configuration file under a healer path, show its line
   to the person and do not dispatch the healer. Dispatch the agent fresh with the target and that baseline id, nothing else. It re-runs, classifies (test
   defect, product defect, stand data, flaky), fixes page objects, data and waits, and stops after three rounds.
2. Recompute the fingerprint and run the guard, both from the baseline's own copy of `.claude/checks/`, never from the working
   tree (the healer could have changed it). Take that copy with `git cat-file blob`, which applies no attributes,
   filters or hooks, and never with `git archive` or a checkout, which run a smudge filter a planted
   `.git/info/attributes` or a global attributes file names; `--no-replace-objects` and `GIT_NO_LAZY_FETCH=1` keep a
   replace ref or a partial clone's fetch from changing what it reads. The fingerprint comes before any git command that can
   run configured code:
   ```shell
   dir=$(mktemp -d) && mkdir "$dir/checks" || exit 1
   for m in expectation-guard project-facts; do GIT_NO_LAZY_FETCH=1 git --no-replace-objects -c core.fsmonitor=false cat-file blob <baseline tree id>:.claude/checks/$m.mts > "$dir/checks/$m.mts" || { rm -rf "$dir"; exit 1; }; done
   test "$(node "$dir/checks/expectation-guard.mts" --repo-fingerprint)" = "<fingerprint>" || { echo "repository config changed by the healer"; rm -rf "$dir"; exit 1; }
   node "$dir/checks/expectation-guard.mts" --base=<baseline tree id>; code=$?
   test $code -eq 0 && { new=$(node "$dir/checks/expectation-guard.mts" --snapshot) || code=1; }; rm -rf "$dir"; test $code -eq 0 && echo "healed tree: $new"; test $code -eq 0
   ```
   On a clean guard the last line prints `healed tree: <new tree id>`, the working tree right after the guard, taken
   with the baseline's copy of the guard.

   "repository config changed by the healer": stop there, show it to the person, and run no other git command or
   test in the repository until they have looked; a planted hook or config line runs with their rights. Any other
   non-zero result means "not clean" (the recipe exits 1 whatever the guard's own code, so a baseline without the two `.claude/checks/` files
   also gives it). Findings listed (a file outside the healer paths, a changed expectation, an added skip, wait
   or similar): stop, show them to the person, and do not offer a review. No finding listed: the guard could not run;
   report "not checked", never clean, and do not offer a review.
3. Present what it fixed, what it classified as a product defect (a `knownIssue` proposal, never a patch), and what
   it escalated. A stand that was not reachable is "not done".

When code changed and the guard is clean, end with the review command, its `healer:` line filled in from the guard
recipe (the baseline id, then the `healed tree`). Put the contract path first when the target was a run record
`.qa/runs/<contract-name>/` and `.qa/contracts/<contract-name>.md` exists; otherwise leave it out:
```
Heal complete. Run /qa-review <contract path or nothing> healer: <baseline tree id> <new tree id> to review the changes.
```
Without a clean guard, name no `healer:` line and offer no review.
