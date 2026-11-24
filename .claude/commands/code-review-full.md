---
description: "Comprehensive code review: 9 parallel review agents (tests, lint, quality, security, style, test quality, test runtime, deps/CI, simplification) + synthesized verdict."
argument-hint: "[branch | commit SHA | PR number/URL | file path(s)] (defaults to current branch/staged/HEAD diff)"
disable-model-invocation: true
---

# Code Review

Run a comprehensive code review using parallel agents, then synthesize findings.

## Scope

Determine what code to review using this priority:

1. **User specifies scope** - If the user provides a branch name, commit SHA, PR number/URL, or file paths, review
   that
2. **On a feature branch** - Review all changes on current branch vs `dev` (`git diff dev...HEAD`), plus uncommitted
   changes
3. **On dev with staged changes** - Review staged files (`git diff --staged`)
4. **On dev, nothing staged** - Review the latest commit (`git show HEAD`)

The repository holds two things, and a change can touch either or both:

- **The framework**, the package `@virtocommerce/test-automation-framework`: `src/` (areas `core`, `http`, `auth`,
  `graphql`, `modules`, `dataset`, `fixtures`), its unit tests in `tests/unit/`, its documentation in `docs/`
  (type-checked examples in `docs/examples/`) and its changesets in `.changeset/`.
- **The Virto Commerce test suite** in `virtocommerce/`: specs in `virtocommerce/tests/`, and `fixtures/`,
  `arrange/`, `builders/`, `support/`, `dataset/`, `pages/`, `graphql/`, `rest/`, `modules.ts`, `env.ts` and its own
  `playwright.config.ts`.

Skip generated code (`virtocommerce/graphql/generated/`, `virtocommerce/rest/generated/`) in every agent. Never read
or print a `.env` file.

Examples:

- "review my branch" → branch diff
- "review pr 123" or "review https://github.com/org/repo/pull/123" → fetch PR via gh
- "review commit abc123" → that specific commit
- "review virtocommerce/tests/restapi/pricing/pricelists.spec.ts" → just that file's recent changes
- (no scope given, on feature branch) → automatic branch diff

Every agent that judges conventions reads [CLAUDE.md](../../CLAUDE.md) first, then
[docs/contributing/conventions.md](../../docs/contributing/conventions.md) for framework code and
[virtocommerce/pages/README.md](../../virtocommerce/pages/README.md) for page objects.

## Instructions

Launch all 9 agents in parallel using a single message with multiple Agent tool calls:

### Agent 1: Test Runner

```
Run the tests affected by the changed files. Suite commands always name the suite's config and a project:
`npx playwright test --config=virtocommerce <spec paths> --project=<name>`, or the npm scripts.
1. `npx playwright test --config=virtocommerce --list` first: it fails fast on spec or fixture wiring errors and
   needs no platform.
2. `npm run test:unit` when framework code (`src/`) changed, and `npm run test:vc:unit` when the suite's dataset
   changed (no platform needed for either).
3. Changed specs: `npx playwright test --config=virtocommerce --no-deps <files> --project=<restapi|graphql|e2e-frontend|e2e-backend>`,
   the project by the spec's directory (`tests/restapi`, `tests/graphql`, `tests/e2e/frontend`, `tests/e2e/backend`).
4. Changed suite code (`fixtures`, `arrange`, `builders`, `support`, `dataset`, `pages`) or framework code the suite
   uses: the specs that import it (find them with grep), or the whole project when the change is broad
   (`npm run test:vc -- --project=<name>`).
5. Changed specs under `virtocommerce/tests/isolated`: run them only if the user confirms
   (`RUN_DESTRUCTIVE_TESTS=true npx playwright test --config=virtocommerce <files> --project=isolated`); they change
   platform-wide state.
If the platform is not reachable, report that the platform tests were not run instead of guessing. New dataset
records need `npm run seed:vc` and a reindex first.

Report:
- Which tests were run, and which were not and why
- Pass/fail status
- Any test failures with details (error message, failing step, trace or screenshot path)
```

### Agent 2: Linter & Static Analysis

```
Run `npm run typecheck` (the framework, the suite and the documentation examples) and `npx biome check <changed
files>` (the rules of `npm run check`: lint, format, import order, layer rules from `.biome/layers.json`; without
--write, so nothing is changed). When `docs/` or the framework's public API changed, also run `npm run docs:check`.
Collect IDE diagnostics (getDiagnostics, if available) for the changed files.

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
- Secrets or credentials in code, dataset JSON or fixtures (passwords belong in the suite's `.env`, referenced from
  the dataset by placeholders)
- Secrets that can reach logs, errors or reports without `Secret` masking (`src/core/secret.ts`: `Secret.of`,
  `maskSecrets`)
- Changes to CI (`.github/workflows/`) that expose values
- Authentication/authorization assumptions in tests (wrong `user`, anonymous where a role is needed)
- Error handling that leaks sensitive info

Also check error handling:
- Swallowed errors hiding problems (catch without rethrow, cleanup failures ignored)
- Unhelpful error messages (missing labels in `requireFields`, undescribed removals registered with `arrange`)

Report issues with severity (Critical/High/Medium/Low) and specific file:line references.
If no issues found, report "No security concerns identified."
```

### Agent 5: Quality & Style Reviewer

```
Read CLAUDE.md and docs/contributing/conventions.md first.

Review the code changes for quality and style issues:

Quality:
1. Complexity - functions too long, deeply nested
2. Dead code - unused imports, exports, variables or dataset records
3. Duplication - logic that already exists in the framework, `arrange`, builders, `support` or page objects

Project conventions:
4. Layers - the framework areas import only what `.biome/layers.json` allows and never the suite; the suite imports
   the framework as `@virtocommerce/test-automation-framework/<area>`; specs import Playwright only through
   `@fixtures`
5. Placement - specs by platform module (users and accounts in `security`); page objects in `virtocommerce/pages/`
   by `pages/README.md`; data in `virtocommerce/dataset/`; REST types only from `@rest/generated/platform.ts`
6. Code style - `function` declarations for named and exported functions, arrows only inline; `readonly #private`
   state; no `any`, `!` or casts; no code comments; documentation comments on exported framework members
7. Terminology - frontend (not storefront), platform, admin UI, directory (not folder)
8. Consistency - naming, step wording and import order match the surrounding files
9. Framework changes - a public API change updates its `docs/concepts/*.md` page and examples, and adds a changeset
   in `.changeset/`

For each issue found, provide:
- File and location
- What the issue is
- Suggested fix

If code is clean, report "No quality or style issues identified."
```

### Agent 6: Test Quality Reviewer

```
Read CLAUDE.md first. Review the changed specs and the coverage of the changed code:

Spec rules:
- `import { expect, test } from "@fixtures"`; `test.describe("<topic> (<who>)")`; who acts is set only with
  `test.use({ user, shopperAs, modules })`
- Every phase in `arrange:` / `act:` / `assert:` steps
- No conditionals, casts or helper functions; repeated cases are one table (rows may hold small lambdas); no raw
  selectors
- Seeded data from `dataset`; data the test needs created with `arrange` in the test body; a test that changes a
  customer's state creates its own customer
- Data the code under test creates registered for removal with an `arrange` `...Later` method right after the act;
  deletions proven by reading the record by id
- Index waits in `arrange` or `expect.poll` with `INDEX_LAG_TIMEOUT_MS`; no `waitForTimeout` or `networkidle`
- `requireFields` instead of `??` defaults
- Platform defects: the test asserts the correct behaviour; a confirmed defect that fails every time is a known issue
  (`PLATFORM_DEFECT_TAG`, the ticket as an `issue` annotation, `test.fail(true, "<ticket>: <defect>")`); no
  `test.fixme`, `test.skip`, retries or workarounds
- Optional modules through `test.use({ modules: { x: MODULES.x } })`; tests target the edge platform
- Platform-wide changes only in `virtocommerce/tests/isolated`, tagged `DESTRUCTIVE_TAG`
- A UI test checks the UI; data rules are checked once through the API
- Framework changes have unit tests in `tests/unit/` (network code against a local `node:http` server)

Coverage (with ROI lens):
- Are critical paths tested? Negative cases and other identities (anonymous, other organization, wrong role)?
- Is the coverage proportionate to the risk?

Quality and flakiness:
- Do assertions verify outcomes and fail when the behavior breaks (no vacuous checks)?
- Do assertions target the test's own data, so parallel tests cannot break them?
- Are async operations awaited?

Report issues with specific suggestions. If tests are well-balanced, report "Test coverage is appropriate and
behavior-focused."
```

### Agent 7: Test Runtime Reviewer

```
Review the code changes for what makes the suite slow or loads the platform:
- UI setup where `arrange` or `shopper.api` would do (signing in through the sign-in page, adding products one by
  one in the UI)
- Repeated sign-ins that bypass the worker's token cache (`signIn`, `tokens`) or fresh customers where a dataset
  user would do for a read-only check
- Sequential awaits that could run in parallel without shared-state races
- Polling with long timeouts or tight intervals; fixed waits
- Fixtures resolved by tests that do not need them (every destructured fixture is created, e.g. `shopper` with
  `shopperAs: "customer"` creates a customer)
- Files forced to `test.describe.configure({ mode: "default" })` or tests moved to `tests/isolated` without a
  shared-state reason
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
- Peer dependencies of the framework package stay peers, with the same ranges style

Framework package (if `src/` changed):
- Does a signature or behavior change break the suite or the documentation examples? (find the callers)
- Is the change in its `docs/concepts/*.md` page, and is there a changeset in `.changeset/` with the right bump?
- Are unit tests in `tests/unit/` updated for the changed framework code?

Suite code (if `virtocommerce/fixtures`, `arrange`, `builders`, `support`, `dataset` or `pages` changed):
- Do renamed fixtures, options or `arrange` methods leave specs, README.md or CLAUDE.md examples behind?

Platform contract:
- Do `.graphql` documents and the generated code match? (`npm run codegen:vc` after document changes)
- Do REST calls match the platform's API, and is `virtocommerce/rest/generated/platform.ts` regenerated after a
  platform upgrade?
- Does `virtocommerce/modules.ts` need a higher `minVersion`, or `virtocommerce/backend-packages.json` a bump, for
  tests that depend on newer module versions?

Shared platform state:
- Do changes in `virtocommerce/dataset/data` or `virtocommerce/dataset/manifest.ts` alter seeded data other specs
  rely on? Does `npm run test:vc:unit` still pass?
- Can the change leave the platform in a different state after a failed run (settings, global configuration)?

CI (`.github/workflows/ci.yml`, `auto-tests.yml`, `release.yml`, the Playwright configs):
- Does the change need new keys in the env-file secret, new workflow inputs or new variables in the suite's
  `env.ts` or the framework's env schemas (`src/core/env.ts`)?
- Do project names, test directories and worker settings (`API_WORKERS`, `E2E_WORKERS`) still match the npm
  scripts, the workflows and README.md?
- Will failures be visible in the list/Allure reports (meaningful step names, errors with context)?

Report issues with specific file references.
If no concerns, report "No dependency, compatibility, or CI concerns."
```

### Agent 9: Simplification & Maintainability Reviewer

```
Review the code changes with fresh eyes, asking "could this be simpler?"

Simplification:
- Are there abstractions that don't pull their weight?
- Could we achieve the same result with less code, or with an existing framework function, `arrange` method,
  builder, `support` read or page object?
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

If the code is appropriately simple and atomic, report "Code complexity is proportionate to the problem and changes
are well-scoped."
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

- **Ready to Merge** - Typecheck, Biome and `--list` are clean, the run tests pass (a test failing on a platform
  defect it names in an `issue` annotation is reported, not counted against the change), no critical/high issues,
  suggestions are optional
- **Needs Attention** - Has medium issues or important suggestions worth addressing, or platform tests could not be
  run
- **Needs Work** - Has critical/high issues or failing tests that must be fixed
