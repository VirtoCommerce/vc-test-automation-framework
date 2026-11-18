# QA Review

**Stage 3 of 3** in the QA workflow: Plan → Implement → Review

You are orchestrating the review stage. Spawn the `qa-reviewer` agent to review the code produced in the previous `/qa-implement` stage, or review any specified files or PR.

Dispatch the reviewer fresh with the diff (or the git range) and the contract path only, never the author's summary.
The reviewer's shell is read-only (a hook enforces it): it cannot run typecheck, lint or `gh`. Run
`commands.typecheck` and `commands.lint` from `node qa/project-facts.mts` yourself and report the result with the
review; for a PR, fetch the diff and metadata with `gh` and pass them in. A failing typecheck or lint means the work
is not done, whatever the reviewer's verdict: do not end with "ready to commit" until both are clean.

## Input

One of:
- No arguments — review the files changed on the current branch
- A file path or glob pattern — review specific files
- A PR number or URL — review a pull request

`$ARGUMENTS` specifies the target. If empty, detect it from git.

## Steps

### 1. Determine Review Scope

If `$ARGUMENTS` is a PR number or URL:
- Spawn the `qa-reviewer` agent with the `/review-pr` skill

If `$ARGUMENTS` is a file path or pattern:
- Spawn the `qa-reviewer` agent with the `/review-test-code` skill

If no arguments:
- Collect changed files: `git diff --name-only dev...HEAD` plus uncommitted changes (`git status --short`)
- Keep TypeScript and GraphQL files under `tests/`, `fixtures/`, `dataset/`, `pages/`, `api/`, `core/` (skip `api/*/generated/`), plus `REFINEMENTS.md` and `dataset/data/**` JSON
- Spawn the `qa-reviewer` agent with `/review-test-code` on those files

### 2. Review

The agent reviews against the skill `framework-rules` and the repository's own style:
- Framework rules (report metadata, `arrange:`/`act:`/`assert:` steps, no conditionals/casts/helpers/raw selectors, layer rules, waits, `knownIssue`)
- Style (the repository's `CLAUDE.md`, linter configuration and neighbouring files)
- The stand (cleanup registered before the change, only `owned` data changed, platform-wide changes in `tests/isolated/`)
- The definition of done (`node qa/reconcile-run.mts` on its own `--list` output and the run record under `.qa/runs/<contract>/`; exit 1 means not done)
- Coverage gaps and cross-file duplication

Whether a test checks its case and fails when the behaviour breaks is the judge's, not the reviewer's.

### 3. Output

Present the review results:
- Per-file review with Critical / Warning / Suggestion items
- Overall verdict: APPROVE / REQUEST_CHANGES / NEEDS_DISCUSSION
- Coverage gap summary

If issues are found, end with:
```
Review complete. Fix the issues above, then run /qa-review again.
```

If approved, end with:
```
Review complete. Code looks good — ready to commit.
```
