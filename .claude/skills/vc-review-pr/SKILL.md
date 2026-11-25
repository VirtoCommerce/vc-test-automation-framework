---
name: vc-review-pr
description: "Review a pull request — analyze diffs, commit quality, CI result, test coverage and convention compliance across all changed files, and provide structured feedback"
argument-hint: "<pr-number-or-url>"
---

## Pull Request Review

Analyze the full scope of the PR and give structured, actionable feedback. The skill `vc-framework-rules` is the source
of the framework's rules and the repository's `CLAUDE.md` of its style; a framework rule beats a style rule.

## Review Process

### Step 1: Gather PR Context

The `vc-qa-reviewer` shell is read-only and cannot run `gh`: the dispatcher fetches the commands below and passes
the diff and the metadata, and the reviewer works from those and from `git diff|log|show`.

```bash
gh pr view <number> --json title,body,baseRefName,headRefName,files,additions,deletions,commits
gh pr diff <number>
gh pr checks <number>
```

### Step 2: Understand the Scope

- What the PR does (title, description, linked ticket).
- Which parts changed: the framework (`src/` areas `core`, `http`, `auth`, `graphql`, `modules`, `dataset`,
  `fixtures`; `tests/unit/`; `docs/`; `.changeset/`), the suite (`virtocommerce/`: `tests`, `fixtures`, `arrange`,
  `builders`, `support`, `dataset`, `pages`, `graphql`, `rest`), config, CI.
- Which projects are affected: `restapi`, `graphql`, `e2e-frontend`, `e2e-backend`, `isolated`, `seed`, and the unit tests of
  the framework (`unit`) and of the suite.

### Step 3: Review Each Changed File

**Specs (`virtocommerce/tests/**/*.spec.ts`):** apply the `/vc-review-test-code` checklist.

**REST calls:**
- Paths and methods match the platform's API; response types come from `@rest/generated/platform.ts`, never
  hand-written shapes.
- `expectOk()` before `json<T>()`; `optionalJson<T>({ allow404 })` only where "not found" is an answer.
- `virtocommerce/rest/generated/` regenerated with `npm run codegen:vc`, never edited by hand.

**GraphQL documents (`virtocommerce/graphql/**/*.graphql`):**
- Generated files regenerated in the same PR (`npm run codegen:vc`); no hand edits in
  `virtocommerce/graphql/generated/`.
- Fragments reused instead of repeated field lists; optional modules' fields kept out of shared fragments.

**Page objects (`virtocommerce/pages/**`):**
- One class per file, named and placed as `virtocommerce/pages/README.md` says.
- `readonly` locators built in the constructor, `data-test-id` first, actions that wait for what they trigger.
- Frontend settings handled inside the page object; no test assertions, no API calls.

**Suite data (`virtocommerce/arrange/`, `builders/`, `support/`, `dataset/`):**
- Builders are pure `newX()` functions with unique values.
- `arrange` methods sit in the right domain and register the removal of what they create; `...Later` methods only
  register removal.
- `dataset/data` or `dataset/manifest.ts` changes: which specs read the changed records? Is the seed still safe to
  repeat? Does `npm run test:vc:unit` still pass?

**Fixtures (`virtocommerce/fixtures/`, `src/fixtures/`):**
- Right scope (worker vs test); worker fixtures have no per-test side effects.
- Minimal dependencies: every destructured fixture is built for each test that uses it.
- Options stay `user`, `shopperAs` and `modules`; renamed or removed fixtures updated in every spec, README, the
  docs and CLAUDE.md.

**Framework source (`src/**`):**
- Layer rules of `.biome/layers.json`; nothing specific to one solution or store.
- Documentation comments on exported members; the concept page in `docs/concepts/` and the examples in
  `docs/examples/` follow the change; a changeset in `.changeset/` for what consumers get.
- Unit tests in `tests/unit/` for every public behaviour.

**Config and CI (`virtocommerce/playwright.config.ts`, `virtocommerce/env.ts`, `src/core/env.ts`,
`.github/workflows/`, `virtocommerce/backend-packages.json`, `virtocommerce/modules.ts`):**
- New variables in the env schema and documented where the suite's environment is described.
- Projects, test directories and worker settings match the npm scripts and the workflows.

### Step 4: Cross-File Analysis

- **Consistency:** new specs follow their neighbours.
- **Callers:** changed signatures in the framework or in the suite's shared code are updated everywhere, the
  documentation examples included.
- **Duplication:** new methods do not duplicate existing ones.
- **Coverage:** the PR tests what it adds; a bug fix has a test that fails without it; framework changes have
  unit tests in `tests/unit/`.
- **Docs:** README, `docs/` and CLAUDE.md updated when conventions, options or scripts change.

### Step 5: Review Commit Quality

- Messages explain why, not only what.
- Each commit is one logical change.

### Step 6: Check CI

- Did `ci.yml` pass (typecheck, Biome, unit tests, docs check, changeset status)?
- Did `auto-tests.yml` (the shared `playwright-tests.yml`) pass for every database and search engine in its matrix?
- Are failures caused by the PR, or by a platform defect a test already names in an `issue` annotation?

## Output Format

```markdown
## PR Review: #<number> — <title>

### Summary
<2-3 sentence overview and quality assessment>

### Scope
- **Files changed:** <count>
- **Parts:** <framework src / unit tests / docs / changesets / suite tests / suite fixtures, arrange, builders,
  support, dataset, pages / config / CI>
- **Projects affected:** <rest / graphql / frontend / backend / isolated / seed / unit>

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

**New coverage:** expect the happy path, error cases, identity differences and data removed after the test. Watch
for assertions on shared lists, dataset users whose state changes, and setup written in the spec instead of
`arrange`.

**Bug fix:** expect a test that fails without the fix. When a platform defect is fixed, the `issue` annotation of the
tests that caught it goes.

**Refactoring:** expect no behavior change;
`npx --no playwright test --config=virtocommerce --list --reporter=list` count unchanged unless intended. Watch for
removed tests without replacement and callers left behind.

**Infrastructure:** expect fixture, framework or `arrange` changes with all callers updated. Watch for fixtures that
now build more for every test, and changed removal order.
