---
description: "Comprehensive code review: 9 parallel review agents (tests, lint, quality, security, style, test quality, test runtime, deps/CI, simplification) + synthesized verdict."
argument-hint: "[branch | commit SHA | PR number/URL | file path(s)] (defaults to current branch/staged/HEAD diff)"
disable-model-invocation: true
---

# Code Review

Run a comprehensive code review using parallel agents, then synthesize findings.

## Scope

Determine what code to review using this priority:

1. **User specifies scope** - If the user provides a branch name, commit SHA, PR number/URL, or file paths, review that
2. **On a feature branch** - Review all changes on current branch vs `dev` (`git diff dev...HEAD`), plus uncommitted changes
3. **On dev with staged changes** - Review staged files (`git diff --staged`)
4. **On dev, nothing staged** - Review the latest commit (`git show HEAD`)

Skip generated code (`api/rest/generated/`, `api/graphql/generated/`) in every agent. Never read or print `.env`.

Examples:

- "review my branch" → branch diff
- "review pr 123" or "review https://github.com/org/repo/pull/123" → fetch PR via gh
- "review commit abc123" → that specific commit
- "review tests/restapi/pricing/pricelists.spec.ts" → just that file's recent changes
- (no scope given, on feature branch) → automatic branch diff

Every agent that judges conventions reads [CLAUDE.md](../../CLAUDE.md) first, and README.md "Writing tests" and "Cleaning up" for the details.

## Instructions

Launch all 9 agents in parallel using a single message with multiple Agent tool calls:

### Agent 1: Test Runner

```
Run the tests affected by the changed files. Use the npm scripts; a bare `npx playwright test <file>` also runs the seed and unit projects.
1. `npx playwright test --list` first: it fails fast on spec or fixture wiring errors and needs no platform.
2. `npm run test:unit` when core, api, dataset, pages or fixtures changed (no platform needed).
3. Changed specs: `npm run test:restapi -- <files>`, `test:graphql`, `test:e2e:frontend`, `test:e2e:backend`.
4. Changed fixtures, api, dataset or pages code: the specs that import it (find them with grep), or the whole project when the change is broad.
5. Changed specs under tests/isolated: run them only if the user confirms (`RUN_DESTRUCTIVE_TESTS=true npm run test:isolated -- <files>`); they change platform-wide state.
If the platform is not reachable, report that the platform tests were not run instead of guessing. New dataset records need `npm run seed` and a reindex first.

Report:
- Which tests were run, and which were not and why
- Pass/fail status
- Any test failures with details (error message, failing step, trace or screenshot path)
```

### Agent 2: Linter & Static Analysis

```
Run `npm run typecheck` (tsc --noEmit) and `npx biome check <changed files>` (the rules of `npm run check`: lint, format, import order, layer rules from biome/layers.json; without --write, so nothing is changed), AND collect IDE diagnostics (getDiagnostics, if available) for the changed files.

Report:
- Tool(s) used
- Any warnings or errors found
- Auto-fixable (`npm run check` fixes them) vs manual fixes needed
- Type errors or unresolved references from IDE diagnostics
```

### Agent 3: Code Reviewer

```
Read CLAUDE.md first.

Review the code changes and provide up to 5 concrete improvements, ranked by:
- Impact (how much this improves the code)
- Effort (how hard it is to implement)

Only include genuinely important issues. If the code is clean, report fewer items or none.

Format each suggestion as:
1. [HIGH/MED/LOW Impact, HIGH/MED/LOW Effort] Title
   - What: Description of the issue
   - Why: Why this matters
   - How: Concrete suggestion to fix

Focus on non-obvious improvements - skip formatting, naming nitpicks, and things linters catch.
```

### Agent 4: Security Reviewer

```
Review the code changes for security concerns:
- Secrets or credentials in code, dataset JSON or fixtures (passwords belong in `.env` and `${ENV:NAME}` placeholders)
- Secrets that can reach logs, errors or Allure reports without `Secret` masking (core/secret.ts)
- Changes to `.env.example` or CI that expose values
- Authentication/authorization assumptions in tests (wrong identity, anonymous where a role is needed)
- Error handling that leaks sensitive info

Also check error handling:
- Swallowed errors hiding problems (catch without rethrow, cleanup failures ignored)
- Unhelpful error messages (missing labels in `requireFields`, undescribed `cleanup.push`)

Report issues with severity (Critical/High/Medium/Low) and specific file:line references.
If no issues found, report "No security concerns identified."
```

### Agent 5: Quality & Style Reviewer

```
Read CLAUDE.md first.

Review the code changes for quality and style issues:

Quality:
1. Complexity - functions too long, deeply nested
2. Dead code - unused imports, exports, variables, dataset records or KNOWN_ISSUES entries
3. Duplication - logic that already exists in `arrange`, builders, clients or page objects

Project conventions:
4. Layers - `core` → `api` → `dataset` → `fixtures` → `tests`, `pages` on `core` only; specs import Playwright only through `@fixtures`
5. Placement - specs by platform module (users and accounts in `security`); page objects in `pages/`; data in `dataset/`
6. Code style - `function` declarations for named and exported functions, arrows only inline; `readonly #private` state; no `any`, `!` or casts; no code comments
7. Terminology - frontend (not storefront), platform, platform admin
8. Consistency - naming, step wording and import order match the surrounding files

For each issue found, provide:
- File and location
- What the issue is
- Suggested fix

If code is clean, report "No quality or style issues identified."
```

### Agent 6: Test Quality Reviewer

```
Read CLAUDE.md "Writing tests" first. Review the changed specs and the coverage of the changed code:

Spec rules:
- Allure epic + feature in beforeEach; story + description per test; `test.describe("<topic> (<who>)")`
- Every phase in `arrange:` / `act:` / `assert:` steps
- No conditionals, casts or helper functions; repeated cases are one table (rows may hold small lambdas); no raw selectors
- Seeded data from `dataset`; changes created with `arrange`; a test that changes a customer's state creates its own customer
- Cleanup registered before the change; deletions proven by reading the record by id
- Index waits in `arrange` or `expect.poll` with `INDEX_LAG_TIMEOUT_MS`; no `waitForTimeout` or `networkidle`
- `requireFields` instead of `??` defaults
- Known defects through `await knownIssue(KNOWN_ISSUES.x)`; no bare `test.fail` / `test.fixme`
- Platform-wide changes only in tests/isolated
- A UI test checks the UI; data rules are checked once through the API

Coverage (with ROI lens):
- Are critical paths tested? Negative cases and other identities (anonymous, other organization, wrong role)?
- Is the coverage proportionate to the risk?

Quality and flakiness:
- Do assertions verify outcomes and fail when the behavior breaks (no vacuous checks)?
- Do assertions target the test's own data, so parallel tests cannot break them?
- Are async operations awaited?
- Is TESTS.md updated when an old-suite test moved, merged or was dropped?

Report issues with specific suggestions. If tests are well-balanced, report "Test coverage is appropriate and behavior-focused."
```

### Agent 7: Test Runtime Reviewer

```
Review the code changes for what makes the suite slow or loads the platform:
- UI setup where `arrange` or `shopper.api` would do (signing in through the sign-in page, adding products one by one in the UI)
- Repeated sign-ins that bypass the token cache (`api/auth/token-manager.ts`) or fresh customers where a dataset user would do for a read-only check
- Sequential awaits that could run in parallel without shared-state races
- Polling with long timeouts or tight intervals; fixed waits
- Fixtures resolved by tests that do not need them (every destructured fixture is created, e.g. `shopper` with `shopperKind: "customer"` creates a customer)
- Files forced to `test.describe.configure({ mode: "default" })` or tests moved to tests/isolated without a shared-state reason
- Unclosed request contexts or growing worker-scoped caches

For each concern, explain the impact and suggest a fix.
If no concerns, report "No runtime concerns identified."
```

### Agent 8: Dependency, Compatibility & CI Reviewer

```
Review changes for dependency, compatibility, and CI concerns:

Dependencies (if package.json or the lock file changed):
- Are new dependencies justified? Could existing ones do the job?
- Are versions pinned like the others, maintained and free of known vulnerabilities?

Shared code (if core, api, dataset, pages or fixtures changed):
- Do signature or behavior changes break specs that are not part of the diff? (find the callers)
- Do renamed fixtures, options or `arrange` methods leave specs, README.md or CLAUDE.md examples behind?
- Are unit tests in tests/unit updated for the changed framework code?

Platform contract:
- Do `.graphql` documents and the generated code match? (`npm run codegen:graphql` after document changes)
- Do REST calls match the platform swagger, and is `api/rest/generated` regenerated after a platform upgrade?
- Does `backend-packages.json` need a bump for tests that depend on newer module versions?

Shared platform state:
- Do changes in dataset/data or dataset/manifest.ts alter seeded data other specs rely on?
- Can the change leave the platform in a different state after a failed run (settings, global configuration)?

CI (.github/workflows/auto-tests.yml, playwright.config.ts):
- Does the change need new keys in the env-file secret, new workflow inputs or new env variables in core/env.ts and .env.example?
- Do project names, folders and worker settings (API_WORKERS, FRONTEND_WORKERS) still match the npm scripts and README.md?
- Will failures be visible in the list/Allure reports (meaningful step names, errors with context)?

Report issues with specific file references.
If no concerns, report "No dependency, compatibility, or CI concerns."
```

### Agent 9: Simplification & Maintainability Reviewer

```
Review the code changes with fresh eyes, asking "could this be simpler?"

Simplification:
- Are there abstractions that don't pull their weight?
- Could we achieve the same result with less code, or with an existing `arrange` method, builder, client or page object?
- Are we solving problems we don't actually have?

Maintainability ROI:
- Will future developers understand this easily?
- Does the complexity match the problem complexity?
- Would a "dumber" solution be easier to maintain long-term?

Look for:
- Premature abstractions (helpers used once, unnecessary indirection)
- Over-configured solutions when simple would suffice
- Clever code that sacrifices clarity

Change Atomicity & Reviewability:
- Does this change represent one logical unit of work?
- Are there unrelated changes mixed in that should be separate commits?
- Is this sized appropriately for PR review?

For each finding, explain:
- What could be simplified
- The simpler alternative
- Maintenance cost saved

If the code is appropriately simple and atomic, report "Code complexity is proportionate to the problem and changes are well-scoped."
```

## After Agents Complete: Synthesize Results

Collect all agent results and produce a prioritized summary:

1. **Categorize findings** - separate issues (should fix) from suggestions (nice to have)
2. **Rank by severity** - Critical > High > Medium > Low across all agents
3. **Collapse clean results** - agents with no findings get one-line summary
4. **Give verdict** - Ready to merge / Needs attention / Needs work

### Output Format

```
## Code Review Summary

### Needs Attention (X issues)
1. [Security] Issue title - file:line
   Brief description
2. [Tests] Issue title - file:line
   Brief description

### Suggestions (X items)
1. [Quality] Title (HIGH impact, LOW effort)
   Brief description
2. [Perf] Title (MED impact, MED effort)
   Brief description
3. [Deps] Title
   Brief description

### All Clear
Tests (N passed), Linter (no issues), [other clean agents...]

### Verdict: [Ready to Merge | Needs Attention | Needs Work]
[One sentence summary of what to do next]
```

### Verdict Guidelines

- **Ready to Merge** - Typecheck, Biome and `--list` are clean, the run tests pass, no critical/high issues, suggestions are optional
- **Needs Attention** - Has medium issues or important suggestions worth addressing, or platform tests could not be run
- **Needs Work** - Has critical/high issues or failing tests that must be fixed
