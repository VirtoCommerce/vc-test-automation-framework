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

Skip generated code (`api/rest/generated/`, `api/graphql/generated/`) in every agent.

Examples:

- "review my branch" → branch diff
- "review pr 123" or "review https://github.com/org/repo/pull/123" → fetch PR via gh
- "review commit abc123" → that specific commit
- "review src/auth.ts" → just that file's recent changes
- (no scope given, on feature branch) → automatic branch diff

## Instructions

Launch all 9 agents in parallel using a single message with multiple Task tool calls:

### Agent 1: Test Runner

```
Run the Playwright specs affected by the changed files against the platform in .env:
- Changed specs: `npx playwright test <spec files>`
- Changed fixtures, api, dataset or pages code: the specs that import it (find them with grep), or the whole project when the change is broad (`npm run test:restapi`, `test:graphql`, `test:e2e:frontend`, `test:e2e:backend`)
- Always run `npx playwright test --list` first: it fails fast on fixture wiring errors
If the platform is not reachable, report that the tests were not run instead of guessing.

Report:
- Which tests were run
- Pass/fail status
- Any test failures with details (error message, failing step, trace path)
```

### Agent 2: Linter & Static Analysis

```
Run `npm run typecheck` (tsc --noEmit) and `npx biome check <changed files>` (lint, format, import order, layer rules from biome/layers.json), AND collect IDE diagnostics (using getDiagnostics) for the changed files.

Report:
- Linting tool(s) used
- Any warnings or errors found
- Auto-fixable vs manual fixes needed
- Type errors or unresolved references from IDE diagnostics
```

### Agent 3: Code Reviewer

```
First, check if CLAUDE.md or a similar project style guide exists. If so, read it to understand project conventions.

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
- Input validation and sanitization
- Injection risks (SQL, command, XSS)
- Authentication/authorization issues
- Secrets or credentials in code
- Error handling that leaks sensitive info

Also check error handling:
- Missing try/catch where needed
- Swallowed errors hiding problems
- Unhelpful error messages

Report issues with severity (Critical/High/Medium/Low) and specific file:line references.
If no issues found, report "No security concerns identified."
```

### Agent 5: Quality & Style Reviewer

```
First, check if CLAUDE.md or a similar project style guide exists. If so, read it to understand project conventions.

Review the code changes for quality and style issues:

Quality:
1. Complexity - functions too long, deeply nested, high cyclomatic complexity
2. Dead code - unused imports, unreachable code, unused variables
3. Duplication - copy-pasted logic that should be abstracted

Style Guidelines:
4. Naming conventions - does naming match project patterns and style guide?
5. File/folder organization - are files in the right place?
6. Architectural patterns - does code follow established patterns in the codebase?
7. Consistency - does new code match the style of surrounding code?
8. Project conventions - does code follow rules in the project style guide (if present)?

For each issue found, provide:
- File and location
- What the issue is
- Suggested fix

If code is clean, report "No quality or style issues identified."
```

### Agent 6: Test Quality Reviewer

```
Review test coverage and quality for the changed code:

Coverage (with ROI lens):
- Are critical paths tested? (auth, payments, data integrity)
- Are edge cases that matter tested?
- Is the coverage proportionate to the risk? (not all code needs equal coverage)
- Would adding more tests here provide diminishing returns?

Quality:
- Do tests verify behavior, not implementation details?
- Will these tests break for the wrong reasons? (testing internals, brittle selectors)
- Are assertions focused on outcomes users care about?
- Would these tests catch real bugs without false positives?

Test Code Quality:
- Are there many similar tests that could be parameterized/data-driven?
- Is there copy-pasted setup that should be extracted to helpers/fixtures?
- Could table-driven tests reduce boilerplate while improving clarity?
- Is test code held to the same quality standards as production code?

Flakiness Risk:
- Are there timing dependencies, race conditions, or order-sensitive assertions?
- Do tests rely on external state that could change?
- Are async operations properly awaited/mocked?

Anti-patterns:
- Testing implementation details (private methods, internal state)
- Mocking so heavily that tests don't verify real behavior
- Tests that pass but don't actually assert meaningful outcomes
- Coverage for coverage's sake on low-risk code

Report issues with specific suggestions. If tests are well-balanced, report "Test coverage is appropriate and behavior-focused."
```

### Agent 7: Test Runtime Reviewer

```
Review the code changes for what makes the suite slow or loads the platform:
- UI setup where an API call or fixture would do (signing in through the sign-in page, adding products one by one)
- Repeated sign-ins instead of the token cache (`tokenManager`, `signInGraphqlClient`) or `signInWithoutCache` used without a reason
- Sequential awaits that could run in parallel without creating shared-state races
- Polling with long timeouts or tight intervals; fixed waits
- Fixtures resolved by tests that do not need them (every destructured fixture is created)
- Unclosed request contexts or growing worker-scoped caches
- Files forced to `mode: "default"` or tests on one worker without a shared-state reason

For each concern, explain the impact and suggest a fix.
If no concerns, report "No runtime concerns identified."
```

### Agent 8: Dependency, Compatibility & CI Reviewer

```
Review changes for dependency, compatibility, and CI concerns:

Dependencies (if package.json or the lock file changed):
- Are new dependencies justified? Could existing ones do the job?
- Are they maintained and free of known vulnerabilities?

Shared code (if core, api, dataset, pages or fixtures changed):
- Do signature or behavior changes break specs that are not part of the diff? (find the callers)
- Do renamed fixtures or options leave specs or README examples behind?

Platform contract:
- Do `.graphql` documents and the generated code match? (`npm run codegen:graphql` after document changes)
- Do REST calls match the platform swagger, and is `api/rest/generated` regenerated after a platform upgrade?
- Does `backend-packages.json` need a bump for tests that depend on newer module versions?

Shared platform state:
- Do dataset or manifest changes alter seeded data other specs rely on?
- Can the change leave the shared platform in a different state (settings, global configuration) after a failed run?

CI:
- Does the change need new env-file secret keys or workflow inputs?
- Will failures be visible in the list/Allure reports (meaningful step names, errors with context), not silent?

Report issues with specific file references.
If no concerns, report "No dependency, compatibility, or CI concerns."
```

### Agent 9: Simplification & Maintainability Reviewer

```
Review the code changes with fresh eyes, asking "could this be simpler?"

Simplification:
- Are there abstractions that don't pull their weight?
- Could we achieve the same result with less code?
- Are we solving problems we don't actually have?
- Is there a more straightforward approach using existing patterns/libraries?

Maintainability ROI:
- Will future developers understand this easily?
- Does the complexity match the problem complexity?
- Are we adding cognitive load for marginal benefit?
- Would a "dumber" solution be easier to maintain long-term?

Look for:
- Premature abstractions (helpers used once, unnecessary indirection)
- Over-configured solutions when simple would suffice
- Framework-level solutions for one-off problems
- Clever code that sacrifices clarity

Change Atomicity & Reviewability:
- Does this change represent one logical unit of work? (atomic commit)
- Are there unrelated changes mixed in that should be separate commits?
- Could any cleanup/refactoring be split out as a preceding commit?
- Is there feature work bundled with unrelated fixes?
- Is this sized appropriately for PR review? (not so large it's overwhelming)
- Does it include enough context to review without jumping everywhere?
- Would splitting this up lose important context a reviewer needs?

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

- **Ready to Merge** - All tests pass, no critical/high issues, suggestions are optional
- **Needs Attention** - Has medium issues or important suggestions worth addressing
- **Needs Work** - Has critical/high issues or failing tests that must be fixed
