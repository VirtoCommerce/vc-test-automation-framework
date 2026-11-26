# `vc-qa-agents init` onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npx vc-qa-agents init` in a terminal asks for the stand's facts once, writes `.env` and `.qa/project.json`, installs, runs codegen and a first read-only test, starts the browser MCP server through a launcher that cannot crash on a missing secrets file, and ends with a readiness table.

**Architecture:** `bin/vc-qa-agents.mjs` stays the entry point and orchestrator; new logic goes into plain-`.mjs` modules in `bin/lib/` (Node does not strip types under `node_modules`, so `bin` never imports a `.mts` check). The checks that already live in `.claude/checks/*.mts` are run as `node` subprocesses from the target directory after `init` has synced them. The browser server is started by a new package-owned check, `.claude/checks/browser-mcp.mts`, which builds the secrets file from the run's variables at every start.

**Tech Stack:** Node >=22.18 (`.mjs`/`.mts`, no new runtime dependency), Playwright Test as the unit runner (`npm run test:unit`, project `unit`, files `tests/unit/**/*.test.ts`), Biome, `@playwright/mcp@0.0.84`.

**Spec:** `specs/2026-11-26-init-onboarding-design.md` (read it first; this plan argues from it).

## Global Constraints

- Node 22.18 or newer; `bin/` gets no new runtime dependency; `node:readline/promises` for prompts.
- Windows is a primary platform: `npx` is `npx.cmd` (spawn it with `shell: true` there); the project path may contain spaces (`C:\Users\x\My Projects\...`), so child processes get `cwd` and relative paths, never an absolute path inside an argument.
- Passwords are never accepted as flags, never printed, never put in `.qa/project.json`; typed passwords go to `.env`; passwords that came from the shell are written to `.env` only with `--save-passwords`.
- A key already non-empty in `.env`, and a role/tracker already changed from the template in `.qa/project.json`, is neither asked nor changed. Existing files, `.mcp.json` and `.claude/settings.json` are never rewritten.
- The launcher writes nothing to stdout (it is the MCP channel); diagnostics go to stderr.
- `init` exits 0 when it wrote its files, whatever the readiness table says; exit 1 only when it could not do its own work. Approving the `playwright` server stays a click in Claude Code.
- Repo style: `function` declarations, `readonly #private` fields, no code comments, kebab-case file names, imports sorted by `npm run check`. A change of the package needs a changeset; `docs/getting-started.md` and the Browser section of `docs/guides/qa-agents.md` are updated in the same change.
- Commits are local on `feat/init-onboarding`; never push.
- A test importing a `.mjs` module may need `allowJs: true` (no `checkJs`) in `tsconfig.json`; add it only if `npm run typecheck` rejects the import.

## Review Focus

- A project path with spaces (`My Projects`): the launcher and the readiness subprocesses must work (Task 4, Task 7).
- A password containing `'` or a line break: the launcher warns on stderr and skips that name instead of crashing or writing a broken file (Task 4).
- Re-running `init` on a finished suite asks nothing and changes nothing (Task 6, Task 8).
- A `.env` with CRLF line endings, quoted values or comments: `fillEnvText` fills empty keys and leaves the rest byte-identical (Task 6).
- Launcher stdout stays empty even when it warns, so a warning can never corrupt the MCP stream (Task 4).

---

### Task 1: Exact pins and the suite's overrides

**Files:**

- Create: `bin/lib/dependencies.mjs`
- Modify: `bin/vc-qa-agents.mjs` (`installDependencies`, `mergePackageJson`), `package.json` (`devDependencies["@biomejs/biome"]` becomes `2.6.8`, the peer range `^2.6.8` stays)
- Test: `tests/unit/bin/dependencies.test.ts`

**Interfaces:**

- Produces: `exactVersion(range: string): string` (strips a leading `^` or `~`; `"latest"` and anything else unchanged); `dependencySpecs(own: PackageJson, names: readonly string[]): string[]` (each `name@"x.y.z"` as JSON-quoted, version from `peerDependencies` then `devDependencies`, else `latest`); `suiteOverrides(own: PackageJson): Record<string, string>` (only the `glob` and `minimatch` entries of `own.overrides`); `withOverrides(manifest: Record<string, unknown>, overrides: Record<string, string>): Record<string, unknown>` (existing entries win).

- [ ] **Step 1: Write the failing test** `dependencies.test.ts`: `exactVersion("^2.6.8")` is `"2.6.8"`, `exactVersion("~1.2.3")` is `"1.2.3"`, `exactVersion("latest")` is `"latest"`; `dependencySpecs({peerDependencies:{a:"^1.0.0"},devDependencies:{b:"2.0.0"}}, ["a","b","c"])` equals `['a@"1.0.0"','b@"2.0.0"','c@"latest"']`; `suiteOverrides({overrides:{glob:"14.0.4",minimatch:"11.0.5",other:"1"}})` equals `{glob:"14.0.4",minimatch:"11.0.5"}`; `withOverrides({overrides:{glob:"9.0.0"}}, {glob:"14.0.4",minimatch:"11.0.5"})` keeps `glob` `9.0.0` and adds `minimatch`; the repository's own `package.json` `devDependencies["@biomejs/biome"]` matches `/^\d+\.\d+\.\d+$/` and equals the version in `.biome/preset.json`'s `$schema`.
- [ ] **Step 2: Run** `npx playwright test --project=unit tests/unit/bin/dependencies.test.ts`; expected FAIL (module missing).
- [ ] **Step 3: Implement** the four functions in `bin/lib/dependencies.mjs`; `installDependencies` builds its specs with `dependencySpecs(own, SUITE_DEPENDENCIES)`; `mergePackageJson` takes the package's `own` manifest, sets `manifest.overrides = withOverrides(manifest, suiteOverrides(own)).overrides` before anything is installed (`init` already merges before it installs); pin Biome in `package.json` and `package-lock.json` (`npm install --save-dev --save-exact @biomejs/biome@2.6.8 --package-lock-only`).
- [ ] **Step 4: Run** the same command; expected PASS. Then `npx playwright test --project=unit tests/unit/bin/init.test.ts`; expected PASS (nothing else changed).
- [ ] **Step 5: Commit** `git add bin package.json package-lock.json tests/unit/bin/dependencies.test.ts && git commit -m "init: install exact versions and the suite's glob/minimatch overrides"`

### Task 2: Platform preflight in the template

**Files:**

- Create: `templates/suite/scripts/check-platform.ts`
- Modify: `bin/vc-qa-agents.mjs` (`SUITE_SCRIPTS.codegen`)
- Test: `tests/unit/bin/check-platform.test.ts`

**Interfaces:**

- Produces: `node scripts/check-platform.ts [--attempts N] [--delay-ms N]` (defaults 4 and 5000), run from the suite directory. It loads `.env` with `process.loadEnvFile` when present, reads `BACKEND_BASE_URL`, and GETs `/docs/PlatformUI/swagger.json`. Exit 0 when any attempt answers 2xx; exit 1 otherwise, with one stderr message.

- [ ] **Step 1: Write the failing test** `check-platform.test.ts`: start a local `node:http` server; (a) it answers `503` twice then `200`: spawning `node templates/suite/scripts/check-platform.ts --attempts 3 --delay-ms 10` with `BACKEND_BASE_URL` set exits 0; (b) it always answers `503`: exit 1 and stderr contains the server's origin, `/docs/PlatformUI/swagger.json`, `503`, `3 attempts` and `still starting`; (c) nothing listens on the port: exit 1 and stderr contains the connection error code (`ECONNREFUSED`); (d) `BACKEND_BASE_URL` unset: exit 1 and stderr names the variable.
- [ ] **Step 2: Run** `npx playwright test --project=unit tests/unit/bin/check-platform.test.ts`; expected FAIL.
- [ ] **Step 3: Implement** the script with `fetch` and a per-attempt `AbortSignal.timeout(10_000)`; it imports nothing from the suite, so it runs before dependencies matter. Message: `The platform at <origin> did not answer GET /docs/PlatformUI/swagger.json (<status or error code>) after <n> attempts. A platform that is still starting needs a minute: wait, then run npm run codegen again.` Set `SUITE_SCRIPTS.codegen` to `node scripts/check-platform.ts && graphql-codegen --config codegen.ts && node scripts/generate-rest-types.ts`.
- [ ] **Step 4: Run** the test file; expected PASS.
- [ ] **Step 5: Commit** `git add templates bin tests && git commit -m "init: name a platform that does not answer before codegen"`

### Task 3: Read-only first test and the test-id attribute

**Files:**

- Modify: `templates/suite/tests/restapi/security/sign-in.spec.ts` (rewritten), `templates/suite/env.ts`, `templates/suite/env.example`, `templates/suite/playwright.config.ts`, `.claude/skills/vc-create-ui-layer/SKILL.md:151`, `.claude/skills/vc-explore-frontend/SKILL.md:86`
- Create: `templates/suite/tests/restapi/security/create-user.example.ts` (the current `sign-in.spec.ts` content, moved)
- Test: `tests/unit/bin/init.test.ts` (extend)

**Interfaces:**

- Produces: env variable `FRONTEND_TEST_ID_ATTRIBUTE` (optional in `suiteEnvSchema`, default `data-test-id`), consumed by `playwright.config.ts` as `defaultUse(env, { testIdAttribute: env.FRONTEND_TEST_ID_ATTRIBUTE })`.

- [ ] **Step 1: Write the failing tests** in `init.test.ts` (new `test` blocks): after `initIn(dir)`, `tests/restapi/security/create-user.example.ts` exists; `sign-in.spec.ts` contains `currentuser` and does not contain `arrange`; `.env.example` contains `FRONTEND_TEST_ID_ATTRIBUTE=data-test-id`; `playwright.config.ts` contains `testIdAttribute: env.FRONTEND_TEST_ID_ATTRIBUTE`; the two skills' text no longer says the attribute is fixed: they contain `FRONTEND_TEST_ID_ATTRIBUTE`.
- [ ] **Step 2: Run** `npx playwright test --project=unit tests/unit/bin/init.test.ts -g "test-id|read-only|create-user"`; expected FAIL.
- [ ] **Step 3: Implement.** New `sign-in.spec.ts`: `test.describe("current user (administrator)")` with `test.use({ user: ADMINISTRATOR })` and the test "the administrator's token identifies the administrator": `arrange`-free, `const current = (await api.get("/api/platform/security/currentuser")).expectOk().json<{ userName: string }>()` inside a `test.step("assert: ...")`, `expect(current.userName).toBe(ADMINISTRATOR.username)`. `env.ts`: add `FRONTEND_TEST_ID_ATTRIBUTE: nonBlankString.default("data-test-id")` to `suiteEnvSchema` with its doc comment (adapt if the schema type does not accept `.default`). The two skills point to the suite's configured attribute (`playwright.config.ts`, from `FRONTEND_TEST_ID_ATTRIBUTE`, default `data-test-id`) instead of stating it.
- [ ] **Step 4: Run** `npx playwright test --project=unit tests/unit/bin/init.test.ts`; expected PASS. Then `npm run typecheck`; expected clean.
- [ ] **Step 5: Commit** `git add templates .claude/skills tests && git commit -m "init: first test only reads, test-id attribute is configurable"`

### Task 4: The browser MCP launcher

**Files:**

- Create: `.claude/checks/browser-mcp.mts`
- Modify: `.claude/checks/browser-secrets.mts` (add `tolerantRunVariables`, change `signInStatus`), `templates/suite/.mcp.json`, `bin/vc-qa-agents.mjs` (delete `wrapForWindows` and its call in `copySuiteTemplate`; replace the `hasBrowserServer` branch of `install()` with `browserServerKind`)
- Test: `tests/unit/bin/browser-mcp.test.ts`; update `tests/unit/bin/init.test.ts` (the test at "writes the browser server that the agents sign in with")

**Interfaces:**

- Produces in `browser-secrets.mts`: `tolerantRunVariables(projectDir: string, shell?: Vars): { vars: Record<string, string | undefined>; names: string[]; warnings: string[] }` — reads `.qa/project.json` as raw JSON (no validation), takes `suiteDir` (string, else `"."`) and `passwordFor` (object of strings, else `{}`), merges the suite's `.env` under the shell like `runVariables`; an unreadable file gives a warning and `names: []`.
- Produces in `browser-mcp.mts`: `BROWSER_SERVER_PACKAGE = "@playwright/mcp@0.0.84"`; `type Launch = { secrets: Record<string, string>; skipped: string[]; warnings: string[] }`; `prepareLaunch(projectDir: string, shell?: Vars): Launch` (a name that is unset, empty, or holds `'`, `\r` or `\n` goes to `skipped` with a warning, never throws); `serverArguments(withSecrets: boolean): string[]` (`["-y", BROWSER_SERVER_PACKAGE, "--browser", "chromium", "--isolated", ...(withSecrets ? ["--secrets", BROWSER_SECRETS_PATH] : [])]`).
- Produces in `bin`: `browserServerKind(target: string): "none" | "launcher" | "direct" | "other"` (`launcher` when the `playwright` server's args contain `browser-mcp.mts`, `direct` when its command or args mention `@playwright/mcp`).
- Changes `signInStatus(projectDir, shell?)`: returns `ready` when every `passwordFor` variable is set in the run's variables, else `not available (<names> not set in the suite's .env or the shell)`; it no longer mentions the secrets file.

- [ ] **Step 1: Write the failing tests** `browser-mcp.test.ts` (temp project dir with `.qa/project.json` and `<suiteDir>/.env`): `prepareLaunch` returns the set passwords in `secrets` and the unset ones in `skipped`; a password `a'b` is in `skipped` with a warning and the other names still work; an invalid `project.json` (the template with `your-company.test` placeholders) still yields the passwords of its `passwordFor`; invalid JSON yields `names: []` and a warning; `serverArguments(false)` has no `--secrets`, `serverArguments(true)` ends with `--secrets .qa/browser-secrets.local.env`; running `node .claude/checks/browser-mcp.mts --prepare-only` in a temp dir **with a space in its name** writes `.qa/browser-secrets.local.env` containing `ADMIN_PASSWORD='...'`, prints nothing to stdout, exits 0 (the `--prepare-only` switch writes the file and stops before starting the server; it is also the launcher's own dry run); `signInStatus` is `ready` / names the unset variable. In `init.test.ts`: the written `.mcp.json` has `playwright.command === "node"` and `args` equal to `[".claude/checks/browser-mcp.mts"]` on every platform; `browserServerKind` is `direct` for a `.mcp.json` with `npx -y @playwright/mcp@0.0.84`, `launcher` for the new template, `none` without the file.
- [ ] **Step 2: Run** `npx playwright test --project=unit tests/unit/bin/browser-mcp.test.ts tests/unit/bin/init.test.ts`; expected FAIL.
- [ ] **Step 3: Implement.** The launcher's CLI part (guarded by the file-name check the other checks use) resolves `projectDir` as two directories above its own file, calls `prepareLaunch`, writes the file for a non-empty `secrets` with the existing `secretsFileText`, `writeFileSync(..., { mode: 0o600 })` and `restrictToOwner`, prints every warning to stderr, then (unless `--prepare-only`) `spawn(process.platform === "win32" ? "npx.cmd" : "npx", serverArguments(Object.keys(secrets).length > 0), { cwd: projectDir, stdio: "inherit", shell: process.platform === "win32" })` and exits with the child's code (forward `SIGINT`/`SIGTERM`). `install()` prints, for `direct`, one line naming the launcher snippet to replace it with; for `none`, today's "No playwright server" line, now naming the launcher snippet. `.mcp.json` template becomes `{ "mcpServers": { "playwright": { "command": "node", "args": [".claude/checks/browser-mcp.mts"] } } }`.
- [ ] **Step 4: Run** the two test files and `npm run typecheck`; expected PASS and clean.
- [ ] **Step 5: Commit** `git add .claude/checks templates bin tests && git commit -m "init: start the browser server through a launcher that builds its secrets"`

### Task 5: Argument parsing with value flags

**Files:**

- Create: `bin/lib/arguments.mjs`
- Modify: `bin/vc-qa-agents.mjs` (`USAGE`, `FLAGS`, `parseArguments`, `suiteDirOf`, `main`)
- Test: `tests/unit/bin/arguments.test.ts`

**Interfaces:**

- Produces: `VALUE_FLAGS = ["--backend-url","--frontend-url","--store-id","--admin-login","--customer","--other-customer","--tracker","--key-pattern","--test-id-attribute"]`; `SWITCHES = { install: ["--force-ours"], init: ["--skip-install","--force-ours","--yes","--save-passwords","--skip-verify"], uninstall: [], doctor: [] }`; `parseArguments(args: string[], usage: string): { command: "install" | "init" | "uninstall" | "doctor"; positional: string[]; switches: ReadonlySet<string>; values: Readonly<Record<string, string>> }`. Value flags are valid only for `init`, in the forms `--flag value` and `--flag=value`; a value flag with no value (or whose next token starts with `--`), an unknown flag, a value flag outside `init` and a second positional throw `Error(usage)`. A password flag (`--password`, `--admin-password`, ...) is unknown and therefore refused.

- [ ] **Step 1: Write the failing test** `arguments.test.ts`: `["init","tests-suite","--yes","--backend-url","http://x"]` gives `positional ["tests-suite"]`, switch `--yes`, value `--backend-url=http://x`; `--tracker=jira` form; `["init","--backend-url"]` throws; `["init","--admin-password","x"]` throws; `["uninstall","--yes"]` throws; `["doctor"]` is command `doctor`; no arguments is command `install`; `["--force-ours"]` is `install` with that switch.
- [ ] **Step 2: Run** `npx playwright test --project=unit tests/unit/bin/arguments.test.ts`; expected FAIL.
- [ ] **Step 3: Implement** `parseArguments`; `USAGE` lists `doctor` and the new flags; `main` passes `positional` to `suiteDirOf` (rename its parameter) and keeps `--skip-install`/`--force-ours` behaviour.
- [ ] **Step 4: Run** `npx playwright test --project=unit tests/unit/bin`; expected PASS (existing usage tests included).
- [ ] **Step 5: Commit** `git add bin tests && git commit -m "init: parse value flags and the doctor command"`

### Task 6: Prompts, answers, and writing them to `.env` and `.qa/project.json`

**Files:**

- Create: `bin/lib/prompts.mjs`, `bin/lib/answers.mjs`, `bin/lib/suite-files.mjs`
- Test: `tests/unit/bin/answers.test.ts`, `tests/unit/bin/suite-files.test.ts`

**Interfaces:**

- Consumes: `parseArguments` result (Task 5).
- Produces in `prompts.mjs`: `isInteractive(switches: ReadonlySet<string>, stdin?: NodeJS.ReadStream, stdout?: NodeJS.WriteStream): boolean` (both TTY and no `--yes`); `type Prompter = { ask(question: string, fallback?: string): Promise<string>; askSecret(question: string): Promise<string>; confirm(question: string): Promise<boolean>; close(): void }`; `createPrompter(input?: Readable, output?: Writable): Prompter` on `readline/promises`; `askSecret` mutes the echo of the typed characters (a `Writable` wrapper that stops forwarding after the prompt), and `Ctrl+C` rejects with an `Error` whose message is `cancelled` (the caller exits 130 and has written nothing).
- Produces in `answers.mjs`: `PASSWORD_NAMES = ["ADMIN_PASSWORD","CUSTOMER_PASSWORD","OTHER_CUSTOMER_PASSWORD"]`; `type Answers = { env: Record<string, string>; passwords: Record<string, string>; persistPasswords: string[]; roles: { customer?: string; otherCustomer?: string }; tracker?: { kind: string; keyPattern: string } }`; `resolveAnswers(input: { values: Record<string,string>; switches: ReadonlySet<string>; shell: Record<string, string | undefined>; existingEnv: Record<string, string>; facts: Record<string, unknown>; prompter?: Prompter }): Promise<Answers>`. Precedence per field: non-empty in `existingEnv` (kept, not asked, not in the result) → flag → shell variable (env names such as `BACKEND_BASE_URL`, and the three password names) → prompt (only when `prompter` is given) → default (`ADMIN_USERNAME` `admin`, `FRONTEND_TEST_ID_ATTRIBUTE` `data-test-id`, tracker from the template). Validation: URLs must parse as http or https, `STORE_ID` non-blank, `keyPattern` must compile as a `RegExp`; the prompt asks again (3 attempts, then throws), a flag or shell value that fails validation throws naming the flag. A typed password goes to `persistPasswords`; a shell password only with `--save-passwords`. The customer and other-customer logins are asked only while `facts.roles.customer` / `["other customer"]` still hold the template's `@your-company.test` placeholders; the tracker only while it is still `jira` and `^PROJ-\d+$`.
- Produces in `suite-files.mjs`: `fillEnvText(text: string, values: Record<string, string>): string` (fills `KEY=` lines whose value is empty in place, appends missing keys, leaves every other byte, including CRLF, comments and quoted values, untouched); `setEnvValue(text: string, key: string, value: string): string` (changes a value even when set; used for `VERIFY_SSL`); `applyFacts(facts: Record<string, unknown>, answers: Answers, adminLogin: string): Record<string, unknown>` (sets `roles.administrator`, `roles.customer`, `roles["other customer"]` and `tracker.kind`/`keyPattern` only for what `answers` carries); `writeAnswers(projectDir: string, suiteDir: string, answers: Answers): void` (reads and writes `<suiteDir>/.env` and `.qa/project.json`; passwords from `persistPasswords` only).

- [ ] **Step 1: Write the failing tests.** `answers.test.ts` with a fake `Prompter` (scripted replies): a second run with a filled `existingEnv` asks nothing and returns an empty `env`; a `--backend-url` flag beats the shell variable and the default; a shell `ADMIN_PASSWORD` is returned in `passwords` but not in `persistPasswords`, and is in it with `--save-passwords`; a typed password is persisted; an invalid URL flag throws naming `--backend-url`; an invalid typed URL is asked again; without a prompter and without a value the field is absent (no throw); the customer question is skipped once `roles.customer` is not a placeholder. `suite-files.test.ts`: `fillEnvText("A=\r\nB=keep\r\nC=''\r\n", {A:"1",B:"2",D:"4"})` returns `"A=1\r\nB=keep\r\nC=''\r\nD=4\r\n"` with `D` appended using the file's line ending; a comment line is untouched; `setEnvValue` changes `VERIFY_SSL=true` to `false`; `applyFacts` on the template's facts replaces the three placeholder logins and leaves `commands` untouched; `writeAnswers` into a temp project never writes a password that is not in `persistPasswords`.
- [ ] **Step 2: Run** `npx playwright test --project=unit tests/unit/bin/answers.test.ts tests/unit/bin/suite-files.test.ts`; expected FAIL.
- [ ] **Step 3: Implement** the three modules to the signatures above; question wording is the builder's, one question per line with the default in brackets, `askSecret` never echoes.
- [ ] **Step 4: Run** the two files; expected PASS.
- [ ] **Step 5: Commit** `git add bin tests && git commit -m "init: ask for the stand's facts and write them to .env and project.json"`

### Task 7: Readiness rows and the browser-server probe

**Files:**

- Create: `bin/lib/readiness.mjs`, `bin/lib/mcp-probe.mjs`
- Test: `tests/unit/bin/readiness.test.ts`

**Interfaces:**

- Consumes: `Prompter`, `setEnvValue` (Task 6); the launcher `.claude/checks/browser-mcp.mts` (Task 4).
- Produces in `readiness.mjs`: `type Row = { check: string; status: "ok" | "fail" | "skipped"; detail: string }`; `request(url: string, options: { method?: string; headers?: Record<string, string>; body?: string; verifySsl: boolean; timeoutMs: number }): Promise<{ status: number; body: string }>` on `node:http`/`node:https` (`rejectUnauthorized: verifySsl`), rejecting with an error that carries `code`; `checkReachable(url: string, options: { verifySsl: boolean; attempts: number; delayMs: number; request?: typeof request }): Promise<{ ok: boolean; detail: string; certificate: boolean }>` (`certificate` true for `DEPTH_ZERO_SELF_SIGNED_CERT`, `SELF_SIGNED_CERT_IN_CHAIN`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `CERT_HAS_EXPIRED`); `checkAdminToken(backend: string, credentials: { username: string; password: string }, options: { verifySsl: boolean; request?: typeof request }): Promise<{ ok: boolean; detail: string }>` (POST `/connect/token`, `application/x-www-form-urlencoded`, `grant_type=password`, 2xx and an `access_token` field is ok; the detail never contains the password); `formatTable(rows: Row[]): string`; `runReadiness(context: { projectDir: string; suiteDir: string; vars: Record<string, string | undefined>; skipInstall: boolean; skipVerify: boolean; prompter?: Prompter; exec(command: string, args: string[], cwd: string): { status: number; output: string }; request?: typeof request; probe?: typeof probeBrowserServer }): Promise<Row[]>`. Rows, in order: `backend`, `frontend`, `administrator`, `project facts`, `types`, `first test`, `browser server`. A row is `skipped: <reason>` when what it needs failed (backend fails → `administrator`, `types`, `first test` are skipped with that reason; empty `ADMIN_PASSWORD` skips `administrator`, `types`, `first test`; `administrator` fails → `first test` skipped; `types` fails → `first test` skipped; `skipInstall` → `types`, `first test`; `skipVerify` → every network row and `browser server`; `browser server` needs only the frontend row). `project facts` runs `node .claude/checks/project-facts.mts` in `projectDir` and is never skipped. `types` runs `npm run codegen`, `first test` runs `npm test`, both in `<projectDir>/<suiteDir>`. Interactive only: when the backend fails with `certificate` and `VERIFY_SSL` is not `false`, `prompter.confirm("The certificate is not trusted (self-signed?). Set VERIFY_SSL=false in .env?")`; on yes `setEnvValue` writes it and the row is checked again. Each failing row's `detail` is one sentence with the one fix.
- Produces in `mcp-probe.mjs`: `probeBrowserServer(options: { projectDir: string; frontendUrl: string; timeoutMs: number }): Promise<{ ok: boolean; detail: string }>` — spawns `node .claude/checks/browser-mcp.mts` (cwd `projectDir`, pipes), sends newline-delimited JSON-RPC `initialize` (protocolVersion `2025-06-18`, a client name) and `notifications/initialized`, then `tools/call` `browser_navigate` with `{ url: frontendUrl }`; a result with `isError` whose text mentions a missing browser (`Executable doesn't exist` or `browser_install`) triggers one `tools/call` `browser_install` and one retry; always kills the whole process tree (`taskkill /pid <pid> /T /F` on Windows, `process.kill(-pid)` elsewhere with `detached: true`).

- [ ] **Step 1: Write the failing tests** `readiness.test.ts` with a local `node:http` server and fake `exec`/`probe`: `checkReachable` ok after a 503 then 200; fail with detail naming the status; a refused connection fails with `ECONNREFUSED` and `certificate: false`; an HTTPS server with a self-signed certificate (generate one with `node:crypto`/a fixture) fails with `certificate: true` and passes with `verifySsl: false`; `checkAdminToken` ok on a 200 with `access_token`, fail on 400, and its detail never contains the password; `runReadiness` marks `administrator`, `types`, `first test` as `skipped` with the reason when `backend` fails; with `skipVerify` every network row is `skipped` and `project facts` still ran; with an empty `ADMIN_PASSWORD` the `administrator` row is `skipped` and no token request was made (the fake `request` was not called); the certificate prompt, given `confirm → true`, sets `VERIFY_SSL=false` in the env text and re-checks; `formatTable` prints one line per row with the status first and no password-looking value.
- [ ] **Step 2: Run** `npx playwright test --project=unit tests/unit/bin/readiness.test.ts`; expected FAIL.
- [ ] **Step 3: Implement** the two modules to the signatures above; `exec` defaults to `spawnSync(command, args, { cwd, shell: process.platform === "win32", encoding: "utf8" })` with stdout and stderr joined into `output`. The real probe (npx download, browser) is exercised in Task 9, not here.
- [ ] **Step 4: Run** the test file and `npm run typecheck`; expected PASS and clean.
- [ ] **Step 5: Commit** `git add bin tests && git commit -m "init: readiness rows and a probe that opens a page through the browser server"`

### Task 8: Wire `init` end to end, and `doctor`

**Files:**

- Modify: `bin/vc-qa-agents.mjs` (`init`, `main`, the final output; `install` keeps its own lines), `tests/unit/bin/init.test.ts`
- Test: `tests/unit/bin/init.test.ts` (extend), `tests/unit/bin/doctor.test.ts`

**Interfaces:**

- Consumes: Tasks 1 to 7.
- Produces: `init` order: parse arguments → copy the suite template → merge `package.json` (with overrides) → `install(target, …)` (syncs `.claude/`, so the checks exist) → read the suite's `.env` and `.qa/project.json` → `resolveAnswers` (the prompter exists only when `isInteractive(switches)`; all questions are asked **before anything is written**, and `cancelled` exits 130 with no change since the template copy) → `writeAnswers` → `installDependencies` unless `--skip-install` → `runReadiness` → print the table and one last line: `Ready: run claude in <dir> and approve the playwright server when it asks.` when no row failed, else `Not ready:` with each failing row's detail. The old six-line `Next:` list is removed. `vc-qa-agents doctor` runs only `readiness` for the current directory (suite dir from `.qa/project.json`, variables from the suite's `.env` under the shell); when `.claude/checks/project-facts.mts` is missing it throws `Run npx vc-qa-agents first: .claude/checks is missing.`. Exit code per the Global Constraints.

- [ ] **Step 1: Write the failing tests.** `init.test.ts` (these run `init --skip-install --skip-verify --yes` with flags and shell variables, no TTY): the output has a `Ready` or `Not ready` line and no `Next:`; with `--backend-url`, `--frontend-url`, `--store-id`, `--customer`, `--other-customer`, `--tracker jira --key-pattern '^VCST-\d+$'` the written `.env` holds the URLs and `STORE_ID` and `.qa/project.json` the logins and pattern; a shell `ADMIN_PASSWORD` is not in `.env` (read the file) and is with `--save-passwords`; **a second identical run leaves `.env`, `.qa/project.json` and `package.json` byte-identical**; an invalid `--backend-url` exits 1 and leaves the directory without `.env` changes; running without a TTY never waits for input (the test sets a 20 s timeout). `doctor.test.ts`: in a directory without `.claude/checks`, `doctor` exits 1 with the "Run npx vc-qa-agents first" message; after an `init … --skip-verify` it prints the table with `skipped` rows and exits 0. Update the tests that assert the old `.mcp.json` shape and the old `Next:` text.
- [ ] **Step 2: Run** `npx playwright test --project=unit tests/unit/bin`; expected FAIL on the new tests.
- [ ] **Step 3: Implement** the wiring; `ask` calls only through the prompter; make sure `.env` and `.qa/project.json` are written once, after every answer exists.
- [ ] **Step 4: Run** `npx playwright test --project=unit tests/unit/bin` and `npm run typecheck && npm run check:ci`; expected PASS and clean.
- [ ] **Step 5: Commit** `git add bin tests && git commit -m "init: one command from install to a ready table, and doctor"`

### Task 9: Documentation, changeset, and the real run

**Files:**

- Modify: `docs/getting-started.md`, `docs/guides/qa-agents.md` (the Browser section and Install), `templates/suite/CLAUDE.template.md` if it names the six steps or the secrets script, `README.md` if it shows the old flow
- Create: `.changeset/init-onboarding.md` (minor for `@virtocommerce/test-automation-framework`: interactive `init`, `doctor`, launcher, exact pins, overrides, read-only first test, `FRONTEND_TEST_ID_ATTRIBUTE`)

- [ ] **Step 1: Update the docs** to the new flow: `npx vc-qa-agents init` asks and ends with the table; flags list and the rule that passwords are never flags; `doctor`; the launcher replaces "write the secrets with `browser-secrets.mts`" (the script stays as a manual tool and is described as such); how an existing suite switches its `.mcp.json` to the launcher; approving the server is one click. Run `npm run docs:check`; expected pass.
- [ ] **Step 2: Add the changeset** with `npm run changeset` (or write the file) and run `npm run check` and `npm run typecheck`; expected clean.
- [ ] **Step 3: Real run, empty directory, reachable stand** (the spec's "Done when"): `mkdir x && cd x && npm init -y`, install the package from a local pack (`npm pack` in the repo, `npm install --save-dev --save-exact <tarball>`), `npx vc-qa-agents init`; answer the questions; expected: every row `ok`, `browser server` `ok`. Then `claude` in that directory lists `playwright` as connected after one approval click. Record what failed; do not mark the task done on a partial result.
- [ ] **Step 4: Real run, no TTY:** the same directory reset, `npx vc-qa-agents init --yes --backend-url … --frontend-url … --store-id … --customer … --other-customer …` with `ADMIN_PASSWORD`, `CUSTOMER_PASSWORD`, `OTHER_CUSTOMER_PASSWORD` in the shell and the output piped (`| cat`); expected: no prompt, a table, exit 0, `.env` without the passwords.
- [ ] **Step 5: Audit and versions:** in the real-run suite, `npm audit` shows nothing coming from `glob` or `minimatch`; `npx biome --version` equals the preset's; `npm run check` there prints no schema-version notice. Fix any miss in its task, then commit `git add docs README.md templates .changeset && git commit -m "init: document the one-command onboarding"`.

---

## Self-review

- **Spec coverage:** modes, questions, flags, test-id → Tasks 3, 5, 6, 8; launcher, `stand.mts`/`signInStatus`, existing-suite detection → Task 4; readiness table, row dependencies, certificate prompt, browser probe with page open and browser install → Task 7; `doctor` and exit codes → Task 8; Biome pin, overrides → Task 1; first test → Task 3; cold platform → Task 2; docs, changeset, "Done when" → Task 9; "passwords not saved without `--save-passwords`" and "click to approve" are in the Global Constraints and Tasks 6, 8, 9. No gap found.
- **Types:** `Prompter` (Task 6) is the type Tasks 7 and 8 consume; `Answers` is produced in Task 6 and consumed by `writeAnswers`/`applyFacts` (Task 6) and `init` (Task 8); `parseArguments` shape (Task 5) feeds `resolveAnswers.values/switches` (Task 6); `BROWSER_SECRETS_PATH` is the existing export of `browser-secrets.mts`.
