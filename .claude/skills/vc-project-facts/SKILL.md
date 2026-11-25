---
name: vc-project-facts
description: "Read the facts of the repository the agents work in (suite directory, tracker, doc sources, commands, roles, critical flows, weights, autonomy) from .qa/project.json through one command, and stop when it fails; the hand-off paths between roles (run record, judge verdict) and the stable-series commands"
---

## Project Facts

Everything that differs between repositories lives in `.qa/project.json`: the directory of the test suite, the
tracker and the ways to read it, the documentation sources, the typecheck, test and (optional) lint commands, the data roles with
their purposes and permissions, the critical flows, the coverage weights, the flaky-run series and what an agent may
apply on its own. Agents never carry these values in their prompts.

## Step 1: Run the Reader First

```shell
node .claude/checks/project-facts.mts
```

It prints the validated JSON. It prints the first problem and exits with 1 when the file is missing, is not valid JSON
or has a missing or invalid field, for example `project.json: commands.typecheck is missing`. A valid file is then
checked against the repository, and the reader exits with 1, one line per problem, for:

- a value that is still the template's example: a role account in the example domain, or the example `PROJ` tracker
  key;
- an `npm run` script that a command names and its `package.json` does not have: the one of its `--prefix <dir>`,
  else the suite's own when the suite is its own npm project, else the root's;
- a key of `commands.test` (other than `unit` and `all`), a key of `quality.durationBudgetMs` or a `--project` flag
  that is not a project the suite's `playwright.config` defines;
- a `healerPaths` entry that is not an existing directory.

Project names are read from the config's source. When they cannot be (the config builds its `projects` list in a way
the reader cannot follow), the reader says so in one line on stderr and does not check them.

## Step 2: Stop When It Fails

- Report the error line as it is and name the file to fix. Do not continue.
- Never fall back to values from another repository, from an earlier run or from memory. A guessed command or role
  runs against the wrong stand.
- A line that names a template value, a missing script, an unknown project or a missing directory is the same stop:
  the file is not this repository's yet. Report the lines and ask; never guess a value to clear them.
- Never edit `.qa/project.json` to make the reader pass. Ask the person who owns the repository.

## Step 3: Read Only From Its Output

- Suite directory: `suiteDir` is the directory of the test suite the agents work on, relative to the repository root
  (`virtocommerce` here). It holds the suite's `playwright.config.ts` and its `.env`. The reader refuses a `suiteDir`
  other than `.` that is not a plain relative directory, with the same rules as `healerPaths`.
- Playwright: `playwright` is not in the file; the reader derives it from `suiteDir` and the files present. It is the
  command that starts Playwright Test on the suite from the repository root, written `<playwright>` in the skills:
  `npx --no playwright test` for a suite at the root, with `--config=<suiteDir>` for a suite in a directory
  (`npx --no playwright test --config=virtocommerce` here), and `npm exec --prefix <suiteDir> --no -- playwright test
  --config=<suiteDir>` when `<suiteDir>/package.json` makes the suite its own npm project with its own
  `node_modules`. Start every Playwright command on the suite with it, exactly; spec paths stay repository-relative
  (`virtocommerce/tests/restapi/security/api-keys.spec.ts`). The read-only shells allow exactly this launcher and
  config flag, and the same launcher before `tsc` and `biome` (`npx --no tsc`, or `npm exec --prefix <suiteDir> --no
  -- tsc`).
- Roles: `roles["<role name>"]` is the account to pass to `test.use({ user })`. Name roles in plans and reports, not
  accounts.
- Role purposes: `roleFor.admin` is the role `arrange` and REST administration tests act as, `roleFor.customer` an
  ordinary signed-in customer, `roleFor.otherCustomer` a customer of another organization (access tests). Each value
  is a key of `roles`; the account is `roles[roleFor.<purpose>]`. The reader requires `customer`; `admin`
  and `otherCustomer` are optional. Without `admin` the facts name no administration role: `arrange` still acts as
  the suite's own administrator, which needs no name, but a case that must act as an administrator under a name (a
  REST administration test, an administrator's data role in a contract) is a scope question for the person, never a
  role you pick. `otherCustomer` is optional (a project with one customer organization has none), and when it is
  absent a cross-organization access case is a scope question for the person, never a role you pick. When present, the reader
  refuses `roleFor.customer` and `roleFor.otherCustomer` naming the same role or the same account. The two must also belong to different
  organizations, which the reader cannot check: take that from the seed, or ask.
- Role permissions (optional): `rolePermissions["<role name>"]` lists the permissions that role holds, named as the
  platform under test names them. A case that needs a role with or without a permission takes it from here. When the
  field is absent or does not settle the question, ask the person; never infer it from knowledge of the platform.
  `rolePermissions["R"]` is the complete list for R: every permission the account `roles["R"]` ends up with, from
  every source of roles the platform has (roles of the account itself, of its organization, of its membership), not
  only the role it is named after. A role in `roles` without an entry has an unknown permission set, never an empty
  one, and is never "a role without P". Use it only when the person confirms. The entries come only from the
  repository's seed or permission files, never from memory, and describe the seed as committed: a stand seeded before
  a change to the seed's roles keeps the old permissions until it is re-seeded. The reader refuses a permission listed
  twice, and two roles of one account with different lists.
- Passwords (optional): `passwordFor["<role name>"]` is the name of the variable that holds that role's password. To
  sign in as the role in the browser, type its account from `roles` and, in the password field, that name, never a
  value: the browser server is started with those variables as secrets and types the value. Sign in only when
  `node .claude/checks/stand.mts` prints `sign-in: ready`, and never retry a refused sign-in.
- Someone else's session: before signing in or naming the account a page was seen as, check the account menu. If
  the browser is already signed in as an account that is not `roles[<the role>]`, never sign it out, switch it or
  sign in over it: it may be a person's own session. Write "not reached: the browser holds another account's
  session" for what needed the role. From pages seen under an account that is not in `roles`, record only their
  structure (paths, controls, test ids, redirects), never a name, id, count, text or other content of that account. A role without an entry cannot be signed in as. The
  reader refuses a role that is not in `roles`, a name that is not an upper-case variable name, and two roles of one
  account with different names.
- Commands: `commands.typecheck`, `commands.lint` and `commands.test["<project>"]`. Run these exactly; do not rebuild
  them from `package.json`. `commands.lint` is optional: without it the repository has no lint step, so say "no lint
  command in the facts" where you would report its result, and never run, invent or substitute one. The keys of `commands.test` are the suite's Playwright projects (`restapi`, `graphql`,
  `e2e-frontend`, `e2e-backend`, `isolated`) plus `unit` (the framework's and the suite's unit tests, no stand) and `all`
  (every project that does not change global state). `isolated` runs the destructive specs and is never part of `all`.
  The project commands run with `--no-deps`, so they never seed: run `commands.seed`, when the facts have it, once
  before the first run on a stand and after a change to the seed data, then any number of project runs. `all` seeds
  once by itself.
- Critical flows: `critical`. An empty list means none are declared; do not invent any.
- Documentation sources: `docSources` lists where to look up how the product should behave, each as
  `{ name, route, where }`. `route` takes the values of `tracker.routes` and means the same: `command`, a command the
  repository provides (`where` names it); `cli`, a command line tool (`where` holds the call); `api`, a read-only
  HTTP call (`where` is the address); `mcp`, a read tool of an MCP server (`where` names it); `paste`, the person
  supplies the text or names a file (`where` says what to ask for). Read a source only by its own route. A route
  that does not answer is noted in one line and the next source is tried; never read a source by another route.
- Knowledge snapshot: `knowledgeDir` is the directory where the knowledge snapshot lives; read it before calling a live
  service.
- Tracker: `tracker.keyPattern` validates a ticket key (the reader refuses a lost escape such as `^d+$`, and one that
  matches no sample key of a `jira` or `azure-boards` kind); `tracker.routes` is the order in which to try to read a ticket,
  ending with pasted text.
- Quality gates: `quality` holds the shape limits (`maxSteps`, `maxLines`, `maxExpects`, `maxNesting`, `maxConditionals`),
  `stableSeries` (the repetitions of a new or changed test, apart from `flakyRunSeries`), `durationBudgetMs` per project
  (keyed by the suite's Playwright projects), `slowdownRatio` and `slowdownMinMs`. Read them; never judge a test by limits of
  your own.
- Autonomy: `autonomy["<area>"]`, else `autonomy["*"]`, which the reader requires. `propose` means write the change
  into the report and wait; `apply` means do it.
- Healer paths: `healerPaths` lists the directories the healer may change (page objects, data). Everything else,
  specs included, is off limits to it, and so is every `.env` file. Each is a plain relative directory that exists, relative to the
  repository root (`virtocommerce/pages/`); the reader refuses a directory that does not exist, the
  repository root, a leading `/` or `\`, a drive or UNC path, `..`, an 8.3 short name (`~1`) and any segment that
  starts with `.git` or `.qa` or is `qa`, `node_modules` or `.claude`.

## Step 4: Hand-off Paths

The roles and the commands hand work to each other through fixed paths. Use exactly these names.

- `<contract-name>` is the contract's file name without `.md`: the `<ticket-key-or-slug>` of
  `.qa/contracts/<ticket-key-or-slug>.md`.
- The run record is `.qa/runs/<contract-name>/`, one pair of files per Playwright project, always named with the
  project, even when the contract has one: `report.<project>.json` (the run) and `list.<project>.json` (what should
  have run). The reviewer writes its own `review-list.<project>.json` there; the healer's runs go to
  `.qa/runs/heal-<slug>/`.
- The judge's verdict is `.qa/judge/<contract-name>/judge-expert.json`. Before the first expert dispatch of a run the
  dispatcher renames an existing one to `judge-expert.previous.json`. The expert reads the verdict only when its
  dispatch says `judge re-dispatch`; any other time it ignores the file.

The stable series of the definition of done, for each project `<project>` the specs belong to, with `<specs>` the new
and changed spec files as repository-relative paths, `<series>` the facts' `quality.stableSeries` and `<playwright>`
the facts' `playwright`:

```shell
PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/<contract-name>/report.<project>.json <commands.test[project]> [--] <specs> --repeat-each=<series> --retries=0 --reporter=list,json
PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/<contract-name>/list.<project>.json <playwright> --list --no-deps --reporter=json --project=<project> --repeat-each=<series> <specs>
node .claude/checks/reconcile-run.mts .qa/runs/<contract-name>/list.<project>.json .qa/runs/<contract-name>/report.<project>.json --contract=.qa/contracts/<contract-name>.md
```

For example, for `restapi`:

```shell
PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/VCST-1234/report.restapi.json npm run test:vc -- --project=restapi --no-deps virtocommerce/tests/restapi/security/api-keys.spec.ts --repeat-each=3 --retries=0 --reporter=list,json
PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/VCST-1234/list.restapi.json npx --no -- playwright test --config=virtocommerce --list --no-deps --reporter=json --project=restapi --repeat-each=3 virtocommerce/tests/restapi/security/api-keys.spec.ts
node .claude/checks/reconcile-run.mts .qa/runs/VCST-1234/list.restapi.json .qa/runs/VCST-1234/report.restapi.json --contract=.qa/contracts/VCST-1234.md
```

Set the variable the way the shell does it. For an npm script pass the arguments after `--`, once: a command that
already holds `--` (`npm run test:vc -- --project=restapi --no-deps`) takes them as they are; for a direct `playwright test`
command append them without `--`, which would make Playwright read them as a file filter. Never hand-edit either JSON
file. Both files name a test by its spec path relative to the suite directory (`tests/restapi/...`), the describe
titles and its title. `reconcile-run` exits 1 when a test failed, was flaky, was skipped without a reason or is
missing a repetition: the run is not done. With `--contract` it also compares the command the series was really started
with (`config.argv` of the report) with the test commands of the contract's `## Verification`: every difference (a flag
among `--workers`, `--repeat-each`, `--retries` and `--grep`, a project, a spec file) is listed under `differences` and
exits 1 unless the run record holds one `deviation: <what differed and why>` line per difference in
`.qa/runs/<contract-name>/deviation.txt`, which whoever ran the series differently writes, by hand (the one file of the
run record that is). The differences stay listed with the reasons under `deviations`. A report older than the last
edit of a spec it covers, or of a file they import, lists those files under `stale` and exits 1: run the series again.
