---
name: review-pr
description: "Review a pull request — analyze diffs, commit quality, CI result, test coverage and convention compliance across all changed files, and provide structured feedback"
argument-hint: "<pr-number-or-url>"
---

## Pull Request Review

Analyze the full scope of the PR and give structured, actionable feedback. CLAUDE.md is the source of the
conventions.

## Review Process

### Step 1: Gather PR Context

```bash
gh pr view <number> --json title,body,baseRefName,headRefName,files,additions,deletions,commits
gh pr diff <number>
gh pr checks <number>
```

### Step 2: Understand the Scope

- What the PR does (title, description, linked ticket).
- Which layers changed: `core`, `api`, `pages`, `dataset`, `fixtures`, `tests`, config, CI.
- Which projects are affected: `restapi`, `graphql`, `e2e-frontend`, `e2e-backend`, `isolated`, `unit`, `seed`.

### Step 3: Review Each Changed File

**Specs (`tests/**/*.spec.ts`):** apply the `/review-test-code` checklist.

**REST clients and types (`api/rest/clients`, `api/rest/types`):**
- Paths and methods match the Swagger; new clients registered in `api/rest/rest-api.ts`.
- `expectOk`, or responses checked against a shape: `record`, `optionalRecord`, `records`, `results`.
- Named types follow a shape plus `Shaped<typeof X>`.

**GraphQL documents (`api/graphql/**/*.graphql`):**
- Generated files regenerated in the same PR (`npm run codegen:graphql`); no hand edits in `api/*/generated/`.
- Fragments reused instead of repeated field lists.

**Page objects (`pages/**`):**
- `readonly` locators built in the constructor, `data-test-id` first, actions that wait for what they trigger.
- Frontend settings handled inside the page object; no test assertions, no API calls, imports only from `core`.

**Dataset (`dataset/**`):**
- Builders are pure `newX()` functions with a client-side `id`.
- Arrange methods sit on the right domain class and register cleanup before the change.
- `dataset/data` or `dataset/manifest.ts` changes: which specs read the changed records? Is the seed still safe
  to repeat?
- `dataset/known-issues.ts`: new entries are used by a `knownIssue` call; fixed defects are removed with their
  calls.

**Fixtures (`fixtures/**`):**
- Right scope (worker vs test); worker fixtures have no per-test side effects.
- Minimal dependencies: every destructured fixture is built for each test that uses it.
- Renamed or removed options updated in every spec, README and CLAUDE.md.

**Config and CI (`playwright.config.ts`, `core/env.ts`, `.env.example`, `.github/workflows`,
`backend-packages.json`):**
- New variables in `core/env.ts`, `.env.example` and the README configuration table.
- Worker counts and projects match README "Parallel workers".

### Step 4: Cross-File Analysis

- **Consistency:** new specs follow their neighbours.
- **Callers:** changed signatures in `core`, `api`, `dataset`, `pages` or `fixtures` are updated everywhere.
- **Duplication:** new methods do not duplicate existing ones.
- **Coverage:** the PR tests what it adds; a bug fix has a test that fails without it; framework changes have
  unit tests in `tests/unit/`.
- **Docs:** README and CLAUDE.md updated when conventions, options or scripts change; REFINEMENTS.md updated when
  the PR does or adds a refinement, or ports an old-suite test listed there.

### Step 5: Review Commit Quality

- Messages explain why, not only what.
- Each commit is one logical change.

### Step 6: Check CI

- Did `auto-tests.yml` pass for every database and search engine in its matrix?
- Are failures caused by the PR, or by a defect already in `dataset/known-issues.ts`?

## Output Format

```markdown
## PR Review: #<number> — <title>

### Summary
<2-3 sentence overview and quality assessment>

### Scope
- **Files changed:** <count>
- **Layers:** <core / api / pages / dataset / fixtures / tests / config>
- **Projects affected:** <restapi / graphql / e2e-frontend / e2e-backend / isolated / unit / seed>

### Critical Issues
- **[file:line]** <issue> — **Fix:** <specific fix>

### Warnings
- **[file:line]** <issue> — **Suggestion:** <improvement>

### Suggestions
- <idea>

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

**New coverage:** expect the happy path, error cases, identity differences and cleanup for every change. Watch for
assertions on shared lists, dataset users whose state changes, and setup written in the spec instead of `arrange`.

**Bug fix:** expect a test that fails without the fix. When a platform defect is fixed, its `KNOWN_ISSUES` entry
and `knownIssue` calls go.

**Refactoring:** expect no behavior change; `npx playwright test --list` count unchanged unless intended. Watch for
removed tests without replacement and callers left behind.

**Infrastructure:** expect fixture, client or arrange changes with all callers updated. Watch for fixtures that
now build more for every test, and changed cleanup order.
