# Migrate Katalon Module

Migrate Katalon REST API test module `$ARGUMENTS` from `VirtoCommerce/vc-quality-gate-katalon` into `tests/restapi/<area>/`.

Arguments format: `<KatalonModule> [jira-ticket]`
Example: `/migrate-katalon-module Contacts VCST-4941`

Follow the `/migrate-katalon-module` skill for the details of each step.

## CRITICAL RULE

**ALWAYS read the Katalon Object Repository `.rs` files FIRST to get the real endpoint URLs and HTTP methods. NEVER guess endpoints from test names.** Then check them against the platform swagger (`BACKEND_BASE_URL/docs/PlatformUI/swagger.json`) and the generated types in `api/rest/generated/rest-api.ts`.

## Execute these steps sequentially

### Step 1: BRANCH
If a jira-ticket is provided: `git checkout dev && git pull && git checkout -b <jira-ticket>-restapi-<area>`

### Step 2: INVENTORY
List all Katalon scripts in the module:
```bash
gh api "repos/VirtoCommerce/vc-quality-gate-katalon/contents/Scripts/API%20Coverage/<KatalonModule>" --jq '.[].name'
```
List sub-scripts of each folder. Classify each: REAL / DRAFT / DEPRECATED / TEMPLATE / UTILITY. Count REAL scripts.

### Step 3: ENDPOINTS (from Object Repository)
Read every `.rs` file before writing code:
```bash
gh api "repos/VirtoCommerce/vc-quality-gate-katalon/contents/Object%20Repository/API/backWebServices/<VirtoCommerce.Module>/<Name>.rs" --jq '.content' | base64 -d | grep -E 'restRequestMethod|restUrl'
```
Build the endpoint map: `Name | HTTP method | URL path`.

### Step 4: CLIENT AND TYPES
Extend or create `api/rest/clients/<area>-client.ts` and `api/rest/types/<area>.ts` with the verified endpoints (`/create-rest-client`). Run `npm run codegen:rest` first if the module's models are missing from `api/rest/generated/rest-api.ts`.

### Step 5: DATA HELPERS
Add `new…()` builders in `dataset/builders/<area>.ts` and, where tests share setup, `arrange…()` helpers with cleanup in `dataset/arrange/<area>.ts`. Seeded ids used by more than one spec go to `dataset/seeded.ts`.

### Step 6: SPECS
Create `tests/restapi/<area>/<feature>.spec.ts` (`/write-rest-api-test`): `allure.feature` in `beforeEach`, `test.describe` per role, arrange/act/assert steps, cleanup through `cleanupStack`. Global-state tests: `test.describe.configure({ mode: "default" })` and `registerSettingRestore`. Platform restarts: `{ tag: "@destructive" }`. Repeated Katalon scripts with different data become one parameterized loop.

### Step 7: LOCAL VERIFY
```bash
npm run typecheck && npm run check
npx playwright test tests/restapi/<area>/
```
Fix every failure.

### Step 8: ENDPOINT VERIFICATION
Cross-reference every endpoint the new client calls against the `.rs` map: normalize `${var}` and `{var}` to `{x}`, strip query strings, match on (method, path). **Result must be 0 MISSING.**

### Step 9: 1-TO-1 MAPPING
Print a table mapping every REAL Katalon script to a test title (or a case of a parameterized loop). **0 MISSING required.**

### Step 10: COMMIT + PUSH
```bash
git add api dataset tests && git commit && git push -u origin <branch>
```

### Step 11: PR
```bash
gh pr create --base dev --title "<JIRA>: REST API <Area> migration (N tests)"
```
Put the mapping table in the description.

### Step 12: CI RUN
```bash
gh workflow run auto-tests.yml --ref <branch> -f testSuites=restapi
```
Wait for a green run on every database. Fix if needed.

### Step 13: MERGE
After review: `gh pr merge <PR> --squash`
