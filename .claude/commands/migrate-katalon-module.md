# Migrate Katalon Module

Migrate Katalon REST API test module `$ARGUMENTS` from `VirtoCommerce/vc-quality-gate-katalon` into `tests/restapi/<platform module>/`.

Arguments format: `<KatalonModule> [jira-ticket]`
Example: `/migrate-katalon-module Contacts VCST-4941`

Follow the `/migrate-katalon-module` skill for the details of each step, and CLAUDE.md / README.md "Writing tests" for every convention. Where they disagree, CLAUDE.md wins.

## CRITICAL RULE

**ALWAYS read the Katalon Object Repository `.rs` files FIRST to get the real endpoint URLs and HTTP methods. NEVER guess endpoints from test names.** Then check them against the platform swagger (`BACKEND_BASE_URL` + `/docs/PlatformUI/swagger.json`, the source of `npm run codegen:rest`) and the generated types in `api/rest/generated/`.

## Execute these steps sequentially

### Step 1: BRANCH
If a jira-ticket is provided: `git checkout dev && git pull && git checkout -b <jira-ticket>-restapi-<area>`

### Step 2: INVENTORY
List all Katalon scripts in the module:
```bash
gh api "repos/VirtoCommerce/vc-quality-gate-katalon/contents/Scripts/API%20Coverage/<KatalonModule>" --jq '.[].name'
```
List sub-scripts of each folder. Classify each: REAL / DRAFT / DEPRECATED / TEMPLATE / UTILITY. Count REAL scripts.

Then check what this repo already covers: search `tests/restapi/`, `tests/graphql/` and `tests/isolated/` for the same behavior. A REAL script that an existing test already covers is mapped to that test, not ported again.

### Step 3: ENDPOINTS (from Object Repository)
Read every `.rs` file before writing code:
```bash
gh api "repos/VirtoCommerce/vc-quality-gate-katalon/contents/Object%20Repository/API/backWebServices/<VirtoCommerce.Module>/<Name>.rs" --jq '.content' | base64 -d | grep -E 'restRequestMethod|restUrl'
```
Build the endpoint map: `Name | HTTP method | URL path`.

### Step 4: CLIENT AND TYPES
Extend or create the module's client in `api/rest/clients/<module>-client.ts`, wire it in `api/rest/rest-api.ts` as `api.rest.<module>`, and add named types to `api/rest/types/<module>.ts` (`/create-rest-client`). Run `npm run codegen:rest` first if the module's models are missing from `api/rest/generated/`.

### Step 5: DATA
- Records the tests only read: from `dataset` (`dataset.<collection>.get(id)`); add JSON to `dataset/data/<collection>/` if needed, then `npm run seed`.
- Records the tests change: `newX()` builders in `dataset/builders/<area>.ts` and `arrange.<domain>.x()` methods in `dataset/arrange/<domain>.ts`, which register their own cleanup.
- Defects the Katalon scripts work around: a `KNOWN_ISSUES` entry in `dataset/known-issues.ts`.

### Step 6: SPECS
Create `tests/restapi/<platform module>/<feature>.spec.ts` (`/write-rest-api-test`). Place by platform module: users and accounts go to `security`, not `customer`.
- `allure.epic("REST API")` + `allure.feature("<Area> / <Topic>")` in `beforeEach`; `allure.story` + `allure.description` per test
- `test.describe("<topic> (<who>)")` with `test.use({ user: "<dataset user name>" })`
- `arrange:` / `act:` / `assert:` steps; no conditionals, casts or helper functions
- Data through `arrange`; cleanup registered before the change; deletions proven by id
- Expected errors with `rejects.toBeHttpError(status, "body text")`; known defects with `await knownIssue(KNOWN_ISSUES.x)`
- Katalon scripts that repeat with different data become one table-driven test
- Scripts that change platform-wide state (global settings, index, restart) go to `tests/isolated/restapi/<module>/`

### Step 7: LOCAL VERIFY
```bash
npm run typecheck
npm run check
npx playwright test --list
npm run test:restapi -- tests/restapi/<module>/
RUN_DESTRUCTIVE_TESTS=true npm run test:isolated -- tests/isolated/restapi/<module>/   # only if isolated tests were added
```
Fix every failure.

### Step 8: ENDPOINT VERIFICATION
Cross-reference every endpoint the new client calls against the `.rs` map: normalize `${var}` and `{var}` to `{x}`, strip query strings, match on (method, path). **Result must be 0 MISSING.**

### Step 9: 1-TO-1 MAPPING
Print a table mapping every REAL Katalon script to a test title (or a row of a table-driven test), or to the existing test that already covers it. **0 MISSING required.**

### Step 10: MAPPING IN THE PR
Put the Step 9 mapping in the PR description, one row per REAL Katalon script: Katalon script, test (or the existing test it merges into), what it checks, and the decision (Migrate / Parameterize / Merge → existing test / Isolate / Drop with reason).

### Step 11: COMMIT + PUSH
```bash
git add api dataset tests && git commit && git push -u origin <branch>
```

### Step 12: PR
```bash
gh pr create --base dev --title "<JIRA>: REST API <Area> migration (N tests)"
```
Put the mapping table in the description.

### Step 13: CI RUN
```bash
gh workflow run auto-tests.yml --ref <branch> -f testSuites=restapi
```
Wait for a green run on every database. Fix if needed. Isolated tests need `testSuites=isolated` and `RUN_DESTRUCTIVE_TESTS=true` in the env-file secret.

### Step 14: MERGE
After review: `gh pr merge <PR> --squash`
