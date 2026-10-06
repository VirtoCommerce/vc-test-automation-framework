# QA Review

**Stage 3 of 3** in the QA workflow: Plan → Implement → Review

You are orchestrating the review stage. Spawn the `qa-reviewer` agent to review the code produced in the previous `/qa-implement` stage, or review any specified files or PR.

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
- Keep TypeScript and GraphQL files under `tests/`, `fixtures/`, `dataset/`, `pages/`, `api/`, `core/` (skip `api/*/generated/`)
- Spawn the `qa-reviewer` agent with `/review-test-code` on those files

### 2. Review

The agent reviews with its checklists:
- Convention compliance (steps, Allure feature, fixtures, seeded constants, layer rules)
- Isolation (cleanup, parallel safety, shared state)
- Correctness (assertions that can fail, waits, nullable handling)
- Coverage gaps and cross-file duplication

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
