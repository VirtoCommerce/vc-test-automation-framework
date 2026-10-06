---
name: review-pr
description: "Review a pull request — analyze diffs, commit quality, CI result, test coverage and convention compliance across all changed files, and provide structured feedback"
argument-hint: "<pr-number-or-url>"
---

## Pull Request Review

Analyze the full scope of the PR and give structured, actionable feedback.

## Review Process

### Step 1: Gather PR Context

```bash
gh pr view <number> --json title,body,baseRefName,headRefName,files,additions,deletions,commits
gh pr diff <number>
gh pr view <number> --json commits --jq '.commits[].messageHeadline'
gh pr checks <number>
```

### Step 2: Understand the Scope

- What is the PR trying to do (title, description, linked ticket)?
- Which layers changed: `core`, `api`, `pages`, `dataset`, `fixtures`, `tests`, config, CI?
- New coverage, bug fix, refactor, or infrastructure change?
- Which projects are affected: `restapi`, `graphql`, `e2e-frontend`, `e2e-backend`, `seed`?

### Step 3: Review Each Changed File

#### Specs (`tests/**/*.spec.ts`)
Apply the `/review-test-code` checklist: structure, steps, isolation, project-specific patterns, quality, coverage.

#### REST clients and types (`api/rest/clients`, `api/rest/types`)
- Paths and methods match the platform swagger
- `expectOk()`, `jsonOrUndefined()` for "not found", `requireFields`/`requireEach` on results
- Named types follow `XXX_FIELDS` + `WithRequired`

#### GraphQL documents (`api/graphql/**/*.graphql`) and generated code
- Generated files changed in the same PR as the documents (`npm run codegen:graphql`)
- Fragments reused instead of repeating field lists
- No hand edits in `api/*/generated/`

#### Page objects (`pages/**`)
- `readonly` locators in the constructor, `data-test-id` selectors, actions as methods
- No assertions, no API calls, imports only from `core`

#### Dataset (`dataset/**`)
- Builders pure, `arrange…()` helpers with cleanup
- Changes to `dataset/data` or `manifest.json`: which specs rely on the changed records? Does the seed still run idempotently?
- New seeded constants in `dataset/seeded.ts` instead of literals in specs

#### Fixtures (`fixtures/**`)
- Scope is right (worker vs test); worker fixtures have no per-test side effects
- Every destructured dependency is created for each test that uses the fixture: keep dependency lists minimal
- Renamed or removed options are updated in every spec and in the README

#### Config and CI (`playwright.config.ts`, `core/env.ts`, `.env.example`, `.github/workflows`, `backend-packages.json`)
- New env keys added to `.env.example` and the README configuration table
- Module version bumps match tests that need them

### Step 4: Cross-File Analysis

- **Consistency**: new specs follow the same conventions as their neighbours
- **Callers**: changed signatures in `core`, `api`, `dataset`, `pages` or `fixtures` are updated everywhere (search the callers)
- **Duplication**: new helpers do not duplicate existing ones
- **Coverage**: the PR tests what it introduces; a bug fix has a test that would have failed before
- **Docs**: README, CLAUDE.md and REFINEMENTS.md updated when conventions, options or open items change

### Step 5: Review Commit Quality

- Messages explain why, not only what
- Each commit is one logical change; refactors separate from new tests where practical

### Step 6: Check CI

- Did the `auto-tests.yml` run pass on every database?
- Failures related to the PR, or known flakiness and platform issues (see README "Known platform issues")?

## Output Format

```markdown
## PR Review: #<number> — <title>

### Summary
<2-3 sentence overview and quality assessment>

### Scope
- **Files changed:** <count>
- **Layers:** <core / api / pages / dataset / fixtures / tests / config>
- **Projects affected:** <restapi / graphql / e2e-frontend / e2e-backend / seed>

### Critical Issues
- **[file:line]** <issue> — **Fix:** <specific fix>

### Warnings
- **[file:line]** <issue> — **Suggestion:** <improvement>

### Suggestions
- <improvement idea>

### Coverage Assessment
- **New code tested:** Yes / No / Partially
- **Missing coverage:** <scenarios>

### Commit Quality
- <assessment>

### CI Status
- <passing / failing — details>

### Verdict
**APPROVE** | **REQUEST_CHANGES** | **NEEDS_DISCUSSION**

<brief rationale>
```

## Common PR Patterns

### New Coverage PR
- Expect: happy path, error cases, role differences, cleanup for every created entity
- Watch for: assertions on shared lists, literal seeded ids, missing `customerAccount` for account-changing tests

### Bug Fix PR
- Expect: a test that fails without the fix; a removed `test.fail` once the product issue is fixed
- Watch for: tests that only exercise the workaround

### Refactoring PR
- Expect: no behavior change; `npx playwright test --list` count unchanged unless intended
- Watch for: removed tests without replacement, callers left behind

### Infrastructure PR
- Expect: fixture, client or helper changes with all callers updated
- Watch for: fixtures that now resolve more dependencies for every test, changed cleanup order
