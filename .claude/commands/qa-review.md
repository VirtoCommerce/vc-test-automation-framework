# QA Review

**Stage 3 of 3** in the QA workflow: Plan → Implement → Review

You are orchestrating the review stage. Spawn the `qa-reviewer` agent to review the code produced in the previous
`/qa-implement` stage, or review any specified files or PR.

Dispatch the reviewer fresh with the diff (or the git range) and the contract path when there is one, never the
author's summary. When there is none, say "no contract" in the dispatch: the reviewer then reviews against the
framework rules and style only and skips the contract-based checks.
After a heal, pass the `healer:` argument on as one fixed line of the dispatch,
`healer: <baseline tree id> <new tree id>`, exactly as given and only when both are git tree ids (7 to 64 hexadecimal
characters); otherwise stop and say so.
The reviewer spares only the hunks of `git diff <baseline tree id> <new tree id>` under the healer paths from its
scope rule.
The reviewer's shell is read-only (a hook enforces it): it cannot run typecheck, lint or `gh`. Run
`commands.typecheck` and `commands.lint` (when the facts have one) from `node .claude/checks/project-facts.mts` yourself and report the result
with the review; for a PR, fetch the diff and metadata with `gh` and pass them in. A failing typecheck or lint means
the work is not done, whatever the reviewer's verdict: do not end with "ready to commit" until both are clean.

## Input

One of:
- A contract path (`.qa/contracts/<contract-name>.md`, as `/qa-implement` names it) — review the implementation of
  that contract
- No arguments — review the files changed on the current branch
- A file path or glob pattern — review specific files
- A PR number or URL — review a pull request

Optionally followed by `healer: <baseline tree id> <new tree id>`, which `/qa-heal` names after a clean guard.

`$ARGUMENTS` specifies the target, then the optional `healer:` part; take that part off before reading the target.
If the target is empty, detect it from git.

## Steps

### 1. Determine Review Scope

If `$ARGUMENTS` is a contract path (a `.md` file under `.qa/contracts/`):
- Run `node .claude/checks/contract.mts check --approved --implemented <contract path>`; when it does not print `ok`,
  show its lines and stop
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
- Keep the TypeScript and GraphQL files of the suite (`virtocommerce/`, skipping `virtocommerce/graphql/generated/`
  and `virtocommerce/rest/generated/`) and of the framework (`src/`, `tests/unit/`), plus the JSON records under
  `virtocommerce/dataset/data/`
- Spawn the `qa-reviewer` agent with `/review-test-code` on those files

### 2. Review

The agent reviews against the skill `framework-rules` and the repository's own style:
- Framework rules (`arrange:`/`act:`/`assert:` steps, no conditionals/casts/helpers/raw selectors, layer rules,
  waits, platform defects left failing with their `issue` annotation)
- Style (the repository's `CLAUDE.md`, linter configuration and neighbouring files)
- The stand (data from `arrange`, `...Later` removal right after the act, only `owned` data changed, platform-wide
  changes only in the isolated project)
- With a contract, the definition of done (`node .claude/checks/reconcile-run.mts` on its own `--list` output and
  the run record under `.qa/runs/<contract-name>/`; exit 1 means not done, unless every failure is a test of a case
  under `## Platform defects`)
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
