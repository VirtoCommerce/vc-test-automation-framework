# QA Review

**Stage 3 of 3** in the QA workflow: Plan → Implement → Review

You are orchestrating the review stage. Spawn the `qa-reviewer` agent to review the code produced in the previous `/qa-implement` stage, or review any specified files or PR.

Dispatch the reviewer fresh with the diff (or the git range) and the contract path when there is one, never the
author's summary. When there is none, say "no contract" in the dispatch: the reviewer then reviews against the
framework rules and style only and skips the contract-based checks.
The reviewer's shell is read-only (a hook enforces it): it cannot run typecheck, lint or `gh`. Run
`commands.typecheck` and `commands.lint` from `node qa/project-facts.mts` yourself and report the result with the
review; for a PR, fetch the diff and metadata with `gh` and pass them in. A failing typecheck or lint means the work
is not done, whatever the reviewer's verdict: do not end with "ready to commit" until both are clean.

## Input

One of:
- A contract path (`.qa/contracts/<contract-name>.md`, as `/qa-implement` names it) — review the implementation of
  that contract
- No arguments — review the files changed on the current branch
- A file path or glob pattern — review specific files
- A PR number or URL — review a pull request

`$ARGUMENTS` specifies the target. If empty, detect it from git.

## Steps

### 1. Determine Review Scope

If `$ARGUMENTS` is a contract path (a `.md` file under `.qa/contracts/`):
- Run `node qa/contract.mts check <contract path>`; when it does not print `ok`, show its lines and stop
- Collect the changed files as for no arguments, new untracked files included (`git status --porcelain`)
- Spawn the `qa-reviewer` agent with `/review-test-code` on those files and the contract path. It runs the
  definition of done on the run record `.qa/runs/<contract-name>/` (the skill `project-facts`, "Hand-off Paths"),
  the scope check and the shape and duration gates

If `$ARGUMENTS` is a PR number or URL:
- Spawn the `qa-reviewer` agent with the `/review-pr` skill, and "no contract"

If `$ARGUMENTS` is any other file path or pattern:
- Spawn the `qa-reviewer` agent with the `/review-test-code` skill, and "no contract"

If no arguments (then also "no contract"):
- Collect changed files: `git diff --name-only dev...HEAD` plus uncommitted changes (`git status --short`)
- Keep TypeScript and GraphQL files under `tests/`, `fixtures/`, `dataset/`, `pages/`, `api/`, `core/` (skip `api/*/generated/`), plus `REFINEMENTS.md` and `dataset/data/**` JSON
- Spawn the `qa-reviewer` agent with `/review-test-code` on those files

### 2. Review

The agent reviews against the skill `framework-rules` and the repository's own style:
- Framework rules (report metadata, `arrange:`/`act:`/`assert:` steps, no conditionals/casts/helpers/raw selectors, layer rules, waits, `knownIssue`)
- Style (the repository's `CLAUDE.md`, linter configuration and neighbouring files)
- The stand (cleanup registered before the change, only `owned` data changed, platform-wide changes in `tests/isolated/`)
- With a contract, the definition of done (`node qa/reconcile-run.mts` on its own `--list` output and the run record under `.qa/runs/<contract-name>/`; exit 1 means not done)
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
