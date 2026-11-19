---
name: project-facts
description: "Read the facts of the repository the agents work in (tracker, doc sources, commands, roles, critical flows, weights, autonomy) from .qa/project.json through one command, and stop when it fails; the hand-off paths between roles (run record, judge verdict) and the stable-series commands"
---

## Project Facts

Everything that differs between repositories lives in `.qa/project.json`: the tracker and the ways to read it, the
documentation sources, the typecheck, lint and test commands, the data roles with their purposes and permissions, the critical flows, the coverage
weights, the flaky-run series and what an agent may apply on its own. Agents never carry these values in their
prompts.

## Step 1: Run the Reader First

```shell
node .claude/checks/project-facts.mts
```

It prints the validated JSON. It prints one line and exits with 1 when the file is missing, is not valid JSON or has
a missing or invalid field, for example `project.json: commands.typecheck is missing`.

## Step 2: Stop When It Fails

- Report the error line as it is and name the file to fix. Do not continue.
- Never fall back to values from another repository, from an earlier run or from memory. A guessed command or role
  runs against the wrong stand.
- Never edit `.qa/project.json` to make the reader pass. Ask the person who owns the repository.

## Step 3: Read Only From Its Output

- Roles: `roles["<role name>"]` is the account to pass to `test.use({ user })`. Name roles in plans and reports, not
  accounts.
- Role purposes: `roleFor.admin` is the role `arrange` and REST administration tests act as, `roleFor.customer` an
  ordinary signed-in customer, `roleFor.otherCustomer` a customer of another organization (access tests). Each value
  is a key of `roles`; the account is `roles[roleFor.<purpose>]`. The reader requires `admin` and `customer`;
  `otherCustomer` is optional (a project with one customer organization has none), and when it is absent a
  cross-organization access case is a scope question for the person, never a role you pick. When present, the reader
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
  sign in as the role in the browser, type that name in the password field, never a value: the browser server is
  started with those variables as secrets and types the value. A role without an entry cannot be signed in as.
- Commands: `commands.typecheck`, `commands.lint` and `commands.test["<project>"]`. Run these exactly; do not rebuild
  them from `package.json`.
- Critical flows: `critical`. An empty list means none are declared; do not invent any.
- Knowledge snapshot: `knowledgeDir` is the directory where the knowledge snapshot lives; read it before calling a live
  service.
- Tracker: `tracker.keyPattern` validates a ticket key (the reader refuses a lost escape such as `^d+$`, and one that
  matches no sample key of a `jira` or `azure-boards` kind); `tracker.routes` is the order in which to try to read a ticket,
  ending with pasted text.
- Quality gates: `quality` holds the shape limits (`maxSteps`, `maxLines`, `maxExpects`, `maxNesting`, `maxConditionals`),
  `stableSeries` (the repetitions of a new or changed test, apart from `flakyRunSeries`), `durationBudgetMs` per project,
  `slowdownRatio` and `slowdownMinMs`. Read them; never judge a test by limits of your own.
- Autonomy: `autonomy["<area>"]`, else `autonomy["*"]`, which the reader requires. `propose` means write the change
  into the report and wait; `apply` means do it.
- Healer paths: `healerPaths` lists the directories the healer may change (page objects, data). Everything else,
  specs included, is off limits to it. Each is a plain relative directory (`pages/`); the reader refuses the
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
and changed spec files and `<series>` the facts' `quality.stableSeries`:

```shell
PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/<contract-name>/report.<project>.json <commands.test[project]> [--] <specs> --repeat-each=<series> --retries=0 --reporter=list,json
PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/<contract-name>/list.<project>.json npx --no -- playwright test --list --reporter=json --project=<project> --repeat-each=<series> <specs>
node .claude/checks/reconcile-run.mts .qa/runs/<contract-name>/list.<project>.json .qa/runs/<contract-name>/report.<project>.json
```

Set the variable the way the shell does it. For an npm script pass the arguments after `--`; for a direct
`playwright test` command append them without `--`, which would make Playwright read them as a file filter. Never
hand-edit either JSON file. `reconcile-run` exits 1 when a test failed, was flaky, was skipped without a reason or is
missing a repetition: the run is not done.
