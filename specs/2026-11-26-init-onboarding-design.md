# `vc-qa-agents init`: one command to a working agent

Date: 2026-11-26. Status: draft, waiting for approval. Branch: `feat/init-onboarding` (worktree `vc-taf-init`, from
`origin/VCST-6837-agent-client-fixes`; `docs/` is published to npm, so this file lives in `specs/`).

## Why

A pilot run of `npx vc-qa-agents init` on a customer repository left the user with six manual steps (fill `.env`,
`codegen`, `test`, `report`, edit `.qa/project.json`, write the browser secrets, restart Claude Code), and the Playwright
MCP server did not work after them. The cause of the server failure is reproduced: the template `.mcp.json` starts
`@playwright/mcp@0.0.84 --secrets .qa/browser-secrets.local.env`, `init` never creates that file (only step 6 does, after
`.env` is filled), and the server exits at start with `ENOENT`. The pilot also found five smaller defects in what `init`
leaves behind. The goal is that a user who runs `init` in a terminal ends with a table that says what works, and the only
thing left is to start `claude`.

## Goals

1. After `init` in a terminal, the user needs nothing but `claude`: the URLs, the store and the administrator's login
   and password are asked once, customer accounts optionally; the test-id attribute is detected; `.env` and
   `.qa/project.json` are written; types are generated; a first test runs.
2. The browser MCP server starts every time, with no manual secrets step and no stale secrets file.
3. `init` ends with a readiness table (one line per check, the single fix for each failure), and the same table can be
   printed later by `vc-qa-agents doctor`.
4. The pilot's smaller findings are fixed: example accounts in `.qa/project.json`; Biome installed at a different version
   than the preset; `glob`/`minimatch` overrides missing in the suite; a first test that writes to the stand; the
   test-id attribute; an unclear error when the REST types cannot be downloaded from a cold platform.

## Non-goals

- Masking registered secrets in the Allure reporter output (a separate framework fix; `allure-playwright` names the
  `fill` step with the typed text).
- A prompt library, a TUI, or any new runtime dependency of `bin/`.
- Rewriting a user's existing `.env`, `.mcp.json`, `package.json` values, agent files or `.qa/project.json` content.
- Production stands: the first test and `codegen` only read.

## Anti-goals (a failure even if everything "works")

- A password on a command line, in shell history, in `.qa/project.json`, in a log, or in `init`'s output.
- A prompt that hangs in CI or when an agent runs `init` (no TTY).
- The MCP launcher writing anything but MCP messages to stdout: stdout is the protocol channel.
- A re-run of `init` that asks again for a value already set, or changes one.

## Approaches considered

| Decision   | Chosen                                                                                                                                   | Not chosen, and why                                                                                                                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| How to ask | `node:readline/promises` inside `init`, all questions in one function                                                                    | `@clack/prompts`: nicer, but adds a runtime dependency and supply-chain surface to a script that has none. A separate `configure` command: one more command to forget; the readiness table's `doctor` covers re-checking |
| MCP server | **Launcher** (`.claude/checks/browser-mcp.mts`) that builds the secrets file from `.env` at each start and then starts the pinned server | Only creating the file in `init`: stops the crash but leaves a manual step and a stale file after a password change. Dropping `--secrets`: the agent would hold the password                                             |
| Scope      | End to end: `init` asks, writes `.env`, installs, runs codegen and a first test, prints the table                                        | Only fixing the MCP server: the user still fills `.env` by hand and runs five commands                                                                                                                                   |

Chosen by the user: the launcher and the end-to-end flow. Prompts via `readline` is the author's call, the user did not
object.

## Behaviour

### Modes

- **Interactive** (stdin and stdout are a TTY, no `--yes`): asks the questions below.
- **Otherwise** (CI, an agent, `--yes`): takes values from flags and from the shell environment, never prompts; a value
  still missing stays empty and shows as a failing or skipped row in the readiness table.

Re-running is safe: a key that is already non-empty in `.env`, or a role/tracker already changed from the template in
`.qa/project.json`, is not asked and not changed. Empty `KEY=` lines in `.env` are filled in place.

### Questions, in order

Five required questions, with no default (the template `.env` is empty):

1. Backend URL (`BACKEND_BASE_URL`), Frontend URL (`FRONTEND_BASE_URL`), `STORE_ID`.
2. Administrator: login (`ADMIN_USERNAME`) and password (`ADMIN_PASSWORD`).

Then one optional step, for a stand where test data cannot be seeded: a customer login (empty ends the step), its
password, another customer's login (a customer of another organization, may be empty) and its password. Logins go to
`roles`, `roleFor` and `passwordFor` in `.qa/project.json`, passwords (`CUSTOMER_PASSWORD`, `OTHER_CUSTOMER_PASSWORD`)
to `.env`. While the facts have no customer, a run in a terminal asks this step again.

The tracker and its key pattern, the project's documentation and the test-id attribute are never asked: they come from
flags (`--tracker`, `--key-pattern`, `--docs`, `--test-id-attribute`), and the test-id attribute otherwise from the
browser probe (below). In `project-facts.mts` the customer and the tracker are optional; `roleFor.otherCustomer`
without `roleFor.customer` is refused. Without a tracker the agents read a ticket from pasted text.

Passwords are typed with hidden input. They are never accepted as flags; in non-interactive mode they come from the
shell variables `ADMIN_PASSWORD`, `CUSTOMER_PASSWORD`, `OTHER_CUSTOMER_PASSWORD` (the names `passwordFor` already uses).

### Flags

New: `--backend-url`, `--frontend-url`, `--store-id`, `--admin-login`, `--customer`, `--other-customer`, `--tracker`,
`--key-pattern`, `--docs`, `--test-id-attribute`, `--frontend-sign-in oauth|cookie`, `--yes`, `--save-passwords`,
`--skip-verify` (no network: skip codegen, the first test and the reachability rows). Kept: `--skip-install`,
`--force-ours`. Unknown flags still fail with the usage line. Every given flag is checked before `init` writes
anything. `--frontend-sign-in cookie` writes a `cookieSignIn` stub into a `fixtures/index.ts` this run created.

### Test-id attribute

Kept in `.env` as `FRONTEND_TEST_ID_ATTRIBUTE` (optional in `env.ts`; empty means `data-test-id`) and read by the
template's `playwright.config.ts` through `defaultUse(env, { testIdAttribute })`. A suite that keeps `defaultUse(env)`
behaves as before. When it is empty and no `--test-id-attribute` is given, the `browser server` row (init and doctor)
calls `browser_evaluate` after `browser_navigate`, counts the elements carrying `data-testid`, `data-test-id`,
`data-test`, `data-qa` and `data-cy`, and writes the most used one; a tie or none leaves it empty. A value that is set
is never changed: the row notes the attribute the frontend uses instead. A failed evaluate never fails the row. The skills `vc-create-ui-layer` and `vc-explore-frontend` now state `data-test-id` as a fact; they must instead
point to the suite's configured value.

### MCP launcher

- `.claude/checks/browser-mcp.mts` is a package-owned file (listed in `.claude/.vc-qa-agents.json`, updated with the
  package, like the other checks). The template `.mcp.json` becomes `{ "command": "node", "args":
  [".claude/checks/browser-mcp.mts"] }`; the `cmd /c` wrapper for Windows is not needed for `node` and is dropped.
- On each start it: resolves the project directory from its own location (not from the working directory); reads the run
  variables with the existing `runVariables`; writes `.qa/browser-secrets.local.env` for the passwords of `passwordFor`
  that are set, restricted to the owner with the existing `restrictToOwner`; starts the pinned
  `@playwright/mcp --browser chromium --isolated`, adding `--secrets <file>` only when the file holds at least one entry;
  passes stdio through and returns the server's exit code.
- A missing password is a warning on stderr, not a failure. Nothing is ever written to stdout by the launcher itself.
- The server version pin lives in the launcher, one place.
- `browser-secrets.mts` stays: `stand.mts` uses it, and it remains the manual way to write the file.
- Existing suites: `npx vc-qa-agents` (install mode) detects a `playwright` server in `.mcp.json` that runs `@playwright/mcp`
  directly and prints how to switch to the launcher. It never edits that file.

### Readiness table

Printed at the end of `init` and by `vc-qa-agents doctor`; one line each, `ok` / `fail` / `skipped`, and one fix for a
failure:

| Check             | Meaning                                                                                |
| ----------------- | -------------------------------------------------------------------------------------- |
| backend, frontend | the URL answers (about 120 s of retries, 20 s each: a cold stand is slow)              |
| administrator     | a token request with the `.env` credentials succeeds                                   |
| project facts     | `project-facts.mts` passes                                                             |
| types             | REST and GraphQL types are generated                                                   |
| first test        | the template's read-only test passes                                                   |
| browser server    | the launcher starts, opens the frontend, detects the test-id attribute, and is stopped |

Before each row `init` prints one progress line (`checking the types (npm run codegen)...`, ASCII dots), and once
`waiting for <origin> to answer...` while it retries.

The last line is `Ready: run claude in <dir>` or the failing rows. `init` exits 0 when it wrote its files, whatever the
table says (a stand can be cold); it exits 1 only when it could not do its own work. Codegen and the first test are
skipped with `skipped: the platform does not answer` when the backend row fails.

### Smaller fixes

- **Biome and other pins.** `installDependencies` strips `^` and `~` from the version it passes to `--save-exact`, so a
  range in the package's own `package.json` no longer resolves to a newer release (today `^2.6.8` installs 2.6.9, and every
  `npm run check` prints a schema notice). The package also pins Biome exactly, to the preset's version.
- **Overrides.** `mergePackageJson` copies the package's own `overrides` for `glob` and `minimatch` into the suite's
  `package.json` before `npm install` (existing entries win), so `npm audit` in the suite stops showing the nine moderate
  findings. Values are read from the package's `package.json`, never typed into `init`.
- **First test.** `tests/restapi/security/sign-in.spec.ts` becomes read-only: the administrator signs in and
  `GET /api/platform/security/currentuser` returns that user. The current user-creating test moves to
  `create-user.example.ts` (not matched by Playwright's `testMatch`), and the getting-started guide points to it.
- **Cold platform.** `scripts/generate-rest-types.ts` and the GraphQL codegen share a preflight: a few attempts to fetch
  the schema, then one message naming the URL, the status or cause, and that a platform that is still starting needs a
  minute.

## Constraints

Node 22.18 or newer (`.mts` runs unflagged, which `browser-secrets.mts` already relies on); Windows is a primary platform
(`npx` is `npx.cmd` there); a change of the package needs a changeset (`.changeset/`); `docs/getting-started.md` and the
Browser section of `docs/guides/qa-agents.md` describe the old flow and are updated in the same change.

## Done when

On an empty directory, with a reachable stand: `npm init -y`, install the package, `npx vc-qa-agents init` answers the
questions, and the table is all `ok`; Claude Code started in that directory lists the `playwright` server as connected
after one approval click and no other command; `npm audit` in the suite shows nothing from `glob`/`minimatch`; the installed Biome version
equals the preset's; the same run with `--yes` and flags in a shell without a TTY finishes without prompting.

## Decided by the user (builder check)

- **Passwords in non-interactive mode are not saved.** Typed passwords (interactive) go to `.env`; passwords that come from
  the shell stay in the shell. `--save-passwords` writes them to `.env` explicitly. The readiness table says
  "passwords from the shell, not saved" so a new terminal's failure is no surprise.
- **Approving the MCP server is a click in Claude Code.** `init` never edits `.claude/settings.json` to approve it; the
  table's last line tells the user to approve the `playwright` server when Claude Code asks. "Done when" is read that way.

## Author's calls (from the builder check; the user can overrule)

- **`bin` is plain `.mjs`, the checks are `.mts`.** Node does not strip types under `node_modules`, so `bin` never imports
  a check. `init` syncs the agent files first, then runs the copies in the target's `.claude/checks` (`project-facts`,
  `stand`) with `node`, as the old steps 5 and 6 did. The network rows (reachability, token request, MCP `initialize`) live
  in `bin`, not in a shipped check, so the read-only agents gain no command that signs in. `doctor` is a fourth command
  (`FLAGS`, `USAGE`) and needs the checks to be present, so it says "run `npx vc-qa-agents` first" when they are not.
- **Chromium for the MCP server.** `@playwright/mcp@0.0.84` brings its own Playwright, whose Chromium revision can differ
  from the suite's. The `browser server` row therefore also opens the frontend page through the server
  (`browser_navigate`), not only `initialize`; when the browser is missing it names the fix, and `init` installs the
  server's own browser with `npx -y <pinned package> install-browser chrome-for-testing` after the dependencies.
- **Invalid facts do not stop the launcher.** If `.qa/project.json` is unreadable or still the template, the launcher falls
  back to the suite's `.env` (`.` when `suiteDir` cannot be read), writes no secrets file, and warns on stderr. So
  `runVariables` is split into a tolerant reader (the launcher) and the strict one (`stand.mts`).
- **`stand.mts` / `signInStatus` change.** `sign-in: ready` now means every `passwordFor` variable is set in the run's
  variables; otherwise it names the unset ones. It stops mentioning the secrets file, which only exists after the server
  starts. The server still reads the variables at start, so a change to `.env` applies after Claude Code restarts it.
- **Row dependencies.** A row is `skipped: <reason>` when what it needs failed: files, then backend, then admin password
  set, then token, then types, then first test; the browser row needs only the frontend and `node`. `--skip-install`
  skips types and the first test with that reason. No stack trace reaches the user from a row.
- **Self-signed certificates.** The checks in `bin` honour `VERIFY_SSL` from the suite's `.env`. When the backend check fails
  on a certificate error, interactive `init` asks once whether to set `VERIFY_SSL=false`; non-interactive says so in the
  row. No flag for it.
- **Biome.** The exact pin goes on the package's `devDependencies`; the `peerDependencies` range stays.

## Changed after live runs (2026-11-26)

- **Five required questions plus an optional customer step.** Most stands seed their own customers; asking for them
  every time blocked a first run on a stand that has none.
- **Tracker, docs and test-id are flags only.** None of them is needed to start the suite, and each question was a
  place to stop or guess.
- **Customer and tracker optional in the facts check; `otherCustomer` needs `customer`.** The facts must pass on a
  stand with no customers and no tracker, and another customer only means something next to a first one.
- **Template `.env.example` empty, examples in comments.** A prefilled example value was taken for an answer and
  shown as a default.
- **Test-id attribute detected by the browser probe.** A live frontend used `data-testid`; the fixed `data-test-id`
  default would have broken every `getByTestId` locator silently.
- **`init` installs the browser server's own browser (`install-browser chrome-for-testing`).** The pinned
  `@playwright/mcp` needs that build, which `npx playwright install chromium` does not install.
- **`--frontend-sign-in oauth|cookie`.** A frontend that keeps its session in cookies needs a different sign-in
  strategy than the Virto Commerce frontend's OAuth token.
- **`.claude/settings.local.json` ignored.** A person's own permission rules must never be committed with the suite.
- **Progress lines.** Codegen, the first test and the browser server take minutes; a silent terminal looked hung.
- **About 120 s wait for a cold stand.** A cloud stand that is starting answers only after a minute or two; a few short
  retries failed it.

## Left to the builder

Wording of the prompts; the timeout and retry numbers; how `.env` lines are filled in place; the Windows `spawn` details of
the launcher; which tracker kinds `project-facts.mts` accepts; the doctor's output layout; where the schema-fetch helper
lives; whether the unit tests this repo's conventions require cover the prompts and the launcher.
