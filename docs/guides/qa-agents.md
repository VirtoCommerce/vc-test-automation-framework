# QA agents

The package ships a set of QA agents for [Claude Code](https://claude.com/claude-code) that plan, write, check, heal
and review the tests of a test suite built on the framework. They work for any solution: what they need to know about
your repository (where the suite is, the commands, the test projects, the roles and accounts, the tracker) comes from
one file, `.qa/project.json`.

## Install

A new test suite gets the agents from `npx vc-qa-agents init` (see
[Getting started](../getting-started.md#start-from-the-template)), with a `.qa/project.json` that matches it: `init`
asks for the stand's URLs, store, logins and passwords, tracker and test-id attribute, writes them, and ends with a
readiness table, so that nothing is left but to start `claude`. `npx vc-qa-agents doctor` prints that table again and
exits with 1 when a row fails. An existing suite installs the agents on their own.

The agents run from your repository's `.claude/` directory, so the package copies them there:

```shell
npm install --save-dev --save-exact @babel/parser
npx vc-qa-agents
```

`vc-qa-agents` copies the agents, commands, skills, check scripts and hook into `.claude/`, next to the repository's
own agents, commands and skills, and records each file it installed, with a hash of its content, in
`.claude/.vc-qa-agents.json`. It creates `.claude/settings.json` with the read-only shell hook and `.qa/project.json`
from an example, but never changes either one once it exists, and it lists the `.gitignore` entries that are missing.
Commit `.claude/` with `.claude/.vc-qa-agents.json`, and `.qa/project.json`; the other files under `.qa/` are the
agents' working files.

Every agent, command and skill of the package is named with the prefix `vc-`, such as the agent `vc-qa-planner`, the
command `/vc-qa` and the skill `vc-framework-rules`, so that none has the name of one the repository already has in
`.claude/`. The check scripts and the hook keep their names.

The check scripts are TypeScript, run by Node 22.18 or newer without a build, and parse specs with `@babel/parser`.

### Update and remove

Run `npx vc-qa-agents` again after you upgrade the package. `.claude/.vc-qa-agents.json` tells it which files are the
package's, and it decides for each file of the new version:

| The file in `.claude/`                                        | `vc-qa-agents`                                          |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| Does not exist                                                | Copies it and records it                                |
| Is listed and unchanged since it was installed                | Replaces it with the new version                        |
| Is listed and was edited since it was installed               | Keeps it and names it; `--force-ours` replaces it       |
| Is not listed: the repository's own, such as its own `/vc-qa` | Keeps it, under any option, and names it                |
| Is listed, but the new version no longer ships it             | Removes it when unchanged; keeps and names it if edited |

A difference in line endings alone is not an edit. A file of the repository is never replaced or removed, and the
package's file of the same name is then not installed: rename the repository's file and run the command again to have
both. `npx vc-qa-agents --force-ours` takes the package's version of the files it installed that were edited since: it
replaces them, removes those the new version no longer ships, and touches no file the manifest does not list.

A repository whose agents were installed by a version that wrote no manifest gets one on its first update: the files
equal to the new version's are recorded as the package's, and every other file of the same name is kept and named, as
it may be the repository's own or a copy of an earlier version. Delete a copy you know is the package's and run the
command again to get the new version.

Versions before the `vc-` prefix named the agents, commands and skills without it: `qa-planner`, `/qa`,
`framework-rules` and so on. An update of such an install with a manifest removes the files of the earlier names that
are unchanged, because the new version no longer ships them, and installs the new ones; an edited one is kept and named
with the file that replaces it. An install without a manifest records nothing of the earlier names, so they are kept:
the first update names, in one line, the files and skill directories of the earlier names, and you delete the ones
that are copies of an earlier version. It also kept the earlier read-only hook, `.claude/hooks/readonly-shell.mts`, and
its `.claude/checks/readonly-shell.mts`, which know only the earlier names and so restrict none of the renamed
read-only agents: `vc-qa-agents` says so whenever either file is not the package's version. Delete the earlier copies
and run it again. Replace `/qa` and the other earlier names wherever the repository
mentions them, such as its `CLAUDE.md`; the files under `.qa/` do not change.

To remove the agents, run `npx vc-qa-agents uninstall`. It removes the files the manifest lists that are unchanged since
they were installed, the directories left empty, and the manifest itself; it names the edited files it kept, and
touches no other file in `.claude/`. It keeps `.claude/settings.json`, from which you remove the read-only shell hook,
and `.qa/`.

## Describe your repository

Replace the example values in `.qa/project.json`, then check it with `node .claude/checks/project-facts.mts`, which
prints the facts or the problems with them. Every agent reads the file through that command and stops when it fails.

Besides the shape of each field, the command refuses a file that is still the template's: an account in the example
domain or the `PROJ` tracker key. It also checks the file against the repository: every `npm run` script of a command
exists in the `package.json` it runs against (of its `--prefix` directory, else the suite's own, else the root's),
every key of `commands.test` (except `unit` and `all`) and of `quality.durationBudgetMs` is a project of the suite's
`playwright.config`, and every `healerPaths` entry is a directory. A config whose projects it cannot read statically
is noted on stderr and its project names are not checked. The printed facts add `playwright`, the command the agents
start Playwright Test on the suite with from the repository root, which the command derives from `suiteDir` and the
files present.

| Field             | Holds                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| `suiteDir`        | The directory of the test suite with its own `playwright.config.ts` and `.env`; `.` for the root            |
| `tracker`         | The tracker kind, the pattern of its keys and the routes the agents may read a ticket by                    |
| `docSources`      | Where the agents look up how the product should behave                                                      |
| `commands`        | The type check, one test command for each Playwright project plus `unit` and `all`, and the lint (optional) |
| `critical`        | The flows that coverage ranks first                                                                         |
| `roles`           | The data roles of the tests, each with its account                                                          |
| `roleFor`         | Which role is a customer, and optionally which administers (`admin`) and which is another customer          |
| `rolePermissions` | The permissions of each role, for security tests                                                            |
| `passwordFor`     | The environment variable that holds each role's password                                                    |
| `quality`         | Limits on the size of a test, the stable series and the time budget of each project                         |
| `autonomy`        | Whether the healer may apply a fix (`apply`) or only propose it (`propose`), by area                        |
| `healerPaths`     | The directories the healer may change: page objects and test data, never the specs                          |

The prompts name no solution: `node .claude/checks/scan-prompts.mts` checks that the shipped files hold none of the
facts' accounts, role names or hosts.

### Where the suite lives

The agents support three layouts, told apart by `suiteDir` and the files in it:

| Layout                                         | `suiteDir`    | `playwright` in the printed facts                                            |
| ---------------------------------------------- | ------------- | ---------------------------------------------------------------------------- |
| The suite at the repository root               | `.`           | `npx --no playwright test`                                                   |
| A suite directory that uses the root's modules | `tests-suite` | `npx --no playwright test --config=tests-suite`                              |
| A suite directory that is its own npm project  | `tests-suite` | `npm exec --prefix tests-suite --no -- playwright test --config=tests-suite` |

A suite directory is its own npm project when it has its own `package.json`: its lock file, `node_modules`,
`playwright.config.ts` and `.env` are there, and the repository root may have no `package.json` at all. The agents,
the hook and `.qa/project.json` still belong at the repository root, and Claude Code must be opened there: it reads
agents, commands and skills only from the `.claude/` directory of the project it was opened in. Install them from the
root with the package the suite already has, `npm exec --prefix tests-suite -- vc-qa-agents`, or start a new suite with
`init tests-suite` (see [Getting started](../getting-started.md#a-suite-in-a-subdirectory)).

The commands of the facts then name the suite's directory with `--prefix`, before or after the script:

```json
{
  "suiteDir": "tests-suite",
  "commands": {
    "typecheck": "npm --prefix tests-suite run typecheck",
    "lint": "npm run check --prefix tests-suite",
    "test": {
      "unit": "npm --prefix tests-suite run typecheck",
      "restapi": "npm exec --prefix tests-suite --no -- playwright test --config=tests-suite --project=restapi --no-deps",
      "all": "npm --prefix tests-suite test"
    }
  },
  "healerPaths": ["tests-suite/pages/", "tests-suite/arrange/"]
}
```

The agents run every Playwright command from the root with the printed `playwright`, so spec paths stay
repository-relative (`tests-suite/tests/restapi/...`); an npm script run with `--prefix` runs in the suite directory,
and Playwright still finds a repository-relative spec path, because it matches the path against the whole file path.
The checks load `@babel/parser` and `graphql` from the suite's `node_modules` when the root has none, so install them
in the suite's project. Only npm is supported: a suite managed with pnpm or Yarn would need a launcher of that
manager that starts the suite's Playwright and keeps the repository root as the working directory, which the checks
and the hook do not derive yet.

## Browser

The agents that open the frontend (`vc-qa-explorer`, `vc-qa-coverage`, `vc-qa-healer`) use a Playwright MCP server
named `playwright`, which Claude Code reads from `.mcp.json` in the repository root. `npx vc-qa-agents init` writes it,
and the server it starts is the launcher `.claude/checks/browser-mcp.mts`, not the server itself:

```json
{ "mcpServers": { "playwright": { "command": "node", "args": [".claude/checks/browser-mcp.mts"] } } }
```

Commit the file. Claude Code asks once to approve the server: that is one click, and `init` never edits
`.claude/settings.json` to do it for you. `init` ends by telling you to approve the `playwright` server when it asks.

The server types the passwords of the roles into the sign-in form, so the agent never holds one. The names of the
variables are the values of `passwordFor`, and the variables are in the suite's `.env` (the template's `.env.example`
lists them). The launcher writes them for the server, so there is no step for you: each time Claude Code starts the
server, the launcher reads the variables of the run, writes `.qa/browser-secrets.local.env` (git-ignored) with the
passwords that are set, restricts the file to the current user (mode `0600` on Linux and macOS, `icacls` on Windows),
and starts the pinned `@playwright/mcp` with `--browser chromium --isolated`, adding `--secrets` only when the file
holds a password. A password that changed in `.env` is therefore picked up when Claude Code restarts the server, and no
stale file is left behind. A password that is not set is a warning on stderr, and the agents cannot sign in with that
role. The launcher writes nothing else to stdout, which is the channel of the protocol, and it does not stop when
`.qa/project.json` is unreadable or still the template's: it falls back to the suite's `.env` and warns.
`node .claude/checks/stand.mts` prints `sign-in: ready` when every variable of `passwordFor` is set in the run's
variables, and names the ones that are not. The `browser server` row of `init` and `doctor` starts the launcher,
asks the server to open the frontend, and stops it.

The server brings its own Playwright, so its Chromium can be a different revision from the suite's. When the server
has no browser, the `browser server` row installs the server's own through the server (`browser_install`), and names
the command to run if that fails.

`node .claude/checks/browser-secrets.mts` stays as a manual tool: it writes `.qa/browser-secrets.local.env` for the
current variables, for a suite that starts the server without the launcher. An existing suite does not need it.

### An existing suite

`init` writes `.mcp.json` only when it does not exist, and `npx vc-qa-agents` never edits it. A suite whose `.mcp.json`
already starts `@playwright/mcp` directly, for example with `--secrets .qa/browser-secrets.local.env`, gets the
launcher by replacing the `playwright` entry with the snippet that `npx vc-qa-agents` prints:

```json
"playwright": { "command": "node", "args": [".claude/checks/browser-mcp.mts"] }
```

Delete the `cmd /c` wrapper if the entry had one: `node` needs none on Windows. The launcher is a file of the
package, so `npx vc-qa-agents` installs and updates it with the other checks. The secrets file is then written at each
start and the manual step is gone.

The test-id attribute of the suite's frontend is `FRONTEND_TEST_ID_ATTRIBUTE` in `.env` (`data-test-id` when unset).
The skills `vc-create-ui-layer` and `vc-explore-frontend` point to that value instead of assuming one.

An API area that no page uses needs no browser. `vc-qa-explorer` reads its schema with
`node .claude/checks/introspect.mts graphql` (or `rest`), which asks the backend of the stand without a credential and
saves the schema in `.qa/kb/`, and observes values of anonymous cases with `node .claude/checks/probe.mts`, which sends
one read-only query or GET that the explorer wrote under `.qa/probes/` (git-ignored). Neither signs in: a case that
needs a role is reported as not reached.

## Use

Start Claude Code in the repository and run `/vc-qa <task>`: a ticket key, a link to a specification, an area such as
"cover the cart", a failing test, "review this branch" or "what is not covered". The orchestrator picks the flow and
runs each role as its own agent:

| Role                      | Does                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `vc-qa-planner`           | Turns the task into a contract of test cases under `.qa/contracts/`, which a person approves |
| `vc-qa-explorer`          | Maps pages and API operations on the stand, read-only                                        |
| `vc-qa-coverage`          | Lists what the tests cover and ranks the gaps                                                |
| `vc-qa-automation-expert` | Implements an approved contract and leaves a run record                                      |
| `vc-qa-judge`             | Checks the expert's tests and proves that they fail when an expected value is broken         |
| `vc-qa-healer`            | Repairs failing tests in page objects and data, never by changing an expected value          |
| `vc-qa-reviewer`          | Reviews the diff against the framework rules and the definition of done                      |

`/vc-qa-plan`, `/vc-qa-implement`, `/vc-qa-review`, `/vc-qa-heal`, `/vc-qa-explore` and `/vc-qa-coverage` run one role.
The rules every test follows are in the `vc-framework-rules` skill; the read-only agents are held to their commands by
the hook.

## Clean up the working files

The agents' working files under `.qa/` are git-ignored and exist only on the machine of whoever worked, so CI cannot
remove them: contracts (`.qa/contracts/`), run records (`.qa/runs/`), judge verdicts (`.qa/judge/`), explorer,
coverage and healer reports (`.qa/reports/`) and probes (`.qa/probes/`). `/vc-qa`, `/vc-qa-plan` and
`/vc-qa-coverage` start by running

```shell
node .claude/checks/prune.mts --fetch --yes
```

which fetches `origin` and removes finished work only: a contract is finished when every case id of its cases table,
but the ones an approved amendment drops, is in a test title on the default branch of `origin` (`origin/HEAD`, else
`main`, else `dev`). Only the spec files the contract's Verification runs count, because case ids repeat from one
contract to the next; a contract whose Verification names no spec file is never finished. The titles are read from the
branch's spec files under `suiteDir` in git, with nothing checked out and no test run. A finished contract goes with its run record, its judge verdict and the `-observed` reports its
oracles cite. A contract stays when its spec files have uncommitted or unpushed changes, or when a local branch that is
not merged into the default branch carries its name. With no `origin` or no default branch ref it removes nothing and
says `not reached`. The command reports the check's last line.

Older files are listed as `ask` lines and removed only when you say yes, with `--yes --include-stale`: contracts with
no approval unchanged for longer than `--days=<n>` (the usage line, printed for an unknown option, gives the
default), coverage reports beyond the newest few of a scope (each line says how many are kept), an `-observed` report
older than the explorer report of its area, healer reports and runs unchanged for as long, and probe files. A report that a remaining contract cites is never removed, nor is the knowledge directory (`knowledgeDir`,
`.qa/kb`), a `.qa/*.local.env` file, anything that matches none of these names, or anything outside `.qa/`.

Run it by hand from the repository root: with no option it only prints what it would remove and why, one line each;
`--fetch` fetches `origin` first, `--yes` removes the finished work and `--yes --include-stale` the older files too.
The read-only shell hook does not let an agent run it: the commands run it from your session.
