# QA Heal

Spawn the `qa-healer` agent once to run failing or flaky specs, classify each failure, and fix the test-side
defects in the healer paths of the project facts (page objects and data, never a spec). It never changes an expected
value or an assertion to match the build.

`$ARGUMENTS` is a spec file, a test title, or a run record path (`.qa/runs/<contract>/`). No arguments: ask for
one.

1. Record a baseline first: `node qa/expectation-guard.mts --snapshot` prints a git tree id of the working tree,
   untracked files included. Dispatch the agent fresh with the target and that baseline id, nothing else. It
   re-runs, classifies (test defect, product defect, stand data, flaky), fixes page objects, data and waits, and
   stops after three rounds.
2. Run `node qa/expectation-guard.mts --base=<baseline tree id>`. Exit 1 means it changed a file outside the healer
   paths or an expectation: stop, show the findings to the person, and do not offer a review. Exit 2 means the guard
   could not run: report "not checked", never clean, and do not offer a review.
3. Present what it fixed, what it classified as a product defect (a `knownIssue` proposal, never a patch), and what
   it escalated. A stand that was not reachable is "not done".

When code changed and the guard is clean, end with:
```
Heal complete. Run /qa-review to review the changes.
```
