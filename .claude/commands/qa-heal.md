# QA Heal

Spawn the `qa-healer` agent once to run failing or flaky specs, classify each failure, and fix the test-side
defects. It never changes an expected value or an assertion to match the build.

`$ARGUMENTS` is a spec file, a test title, or a run record path (`.qa/runs/<contract>/`). No arguments: ask for
one.

1. Record a baseline first: `git stash create`, or `HEAD` when it prints nothing. Dispatch the agent fresh with that
   target and nothing else. It re-runs, classifies (test defect, product defect, stand data, flaky), fixes page objects,
   data and waits, and stops after three rounds.
2. Run `node qa/expectation-guard.mts --base=<baseline commit>`. Exit 1 means its diff changed an expectation: stop, show the finding to
   the person, and do not offer a review.
3. Present what it fixed, what it classified as a product defect (a `knownIssue` proposal, never a patch), and what
   it escalated. A stand that was not reachable is "not done".

When code changed and the guard is clean, end with:
```
Heal complete. Run /qa-review to review the changes.
```
