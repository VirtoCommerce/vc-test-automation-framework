# QA agents

The package ships a set of QA agents for [Claude Code](https://claude.com/claude-code) that plan, write, check, heal
and review the tests of a test suite built on the framework. They work for any solution: what they need to know about
your repository (where the suite is, the commands, the test projects, the roles and accounts, the tracker) comes from
one file, `.qa/project.json`.

## Install

A new test suite gets the agents from `npx vc-qa-agents init` (see
[Getting started](../getting-started.md#start-from-the-template)), with a `.qa/project.json` that matches it. An
existing suite installs them on their own.

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

The check scripts are TypeScript, run by Node 22.18 or newer without a build, and parse specs with `@babel/parser`.

### Update and remove

Run `npx vc-qa-agents` again after you upgrade the package. `.claude/.vc-qa-agents.json` tells it which files are the
package's, and it decides for each file of the new version:

| The file in `.claude/`                                     | `vc-qa-agents`                                          |
| ---------------------------------------------------------- | ------------------------------------------------------- |
| Does not exist                                             | Copies it and records it                                |
| Is listed and unchanged since it was installed             | Replaces it with the new version                        |
| Is listed and was edited since it was installed            | Keeps it and names it; `--force-ours` replaces it       |
| Is not listed: the repository's own, such as its own `/qa` | Keeps it, under any option, and names it                |
| Is listed, but the new version no longer ships it          | Removes it when unchanged; keeps and names it if edited |

A difference in line endings alone is not an edit. A file of the repository is never replaced or removed, and the
package's file of the same name is then not installed: rename the repository's file and run the command again to have
both. `npx vc-qa-agents --force-ours` takes the package's version of the files it installed that were edited since: it
replaces them, removes those the new version no longer ships, and touches no file the manifest does not list.

A repository whose agents were installed by a version that wrote no manifest gets one on its first update: the files
equal to the new version's are recorded as the package's, and every other file of the same name is kept and named, as
it may be the repository's own or a copy of an earlier version. Delete a copy you know is the package's and run the
command again to get the new version.

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

The agents that open the frontend (`qa-explorer`, `qa-coverage`, `qa-healer`) use a Playwright MCP server named
`playwright`, which Claude Code reads from `.mcp.json` in the repository root. `npx vc-qa-agents init` writes it, with
the server pinned to one version and started as `--browser chromium --isolated --secrets
.qa/browser-secrets.local.env`; on Windows the command is wrapped in `cmd /c`, as Claude Code needs it there. Commit
the file. Claude Code asks once to approve the server. An existing suite adds the same server to its own `.mcp.json`:
`npx vc-qa-agents` says when it is missing.

The server types the passwords of the roles into the sign-in form, so the agent never holds one. The names of the
variables are the values of `passwordFor`, and the variables are in the suite's `.env` (the template's `.env.example`
lists them). Write them for the server with:

```shell
node .claude/checks/browser-secrets.mts
```

It writes `.qa/browser-secrets.local.env` (git-ignored) and restricts it to the current user: by mode `0600` on Linux
and macOS, by `icacls` on Windows, where the mode does nothing. When it cannot restrict the file it says so as a
warning; restrict the file yourself then. The server reads the file when it starts, so restart it after the file
changes. `node .claude/checks/stand.mts` prints `sign-in: ready` when the file matches the run's variables.

An API area that no page uses needs no browser. `qa-explorer` reads its schema with `node .claude/checks/introspect.mts
graphql` (or `rest`), which asks the backend of the stand without a credential and saves the schema in `.qa/kb/`, and
observes values of anonymous cases with `node .claude/checks/probe.mts`, which sends one read-only query or GET that
the explorer wrote under `.qa/probes/` (git-ignored). Neither signs in: a case that needs a role is reported as not
reached.

## Use

Start Claude Code in the repository and run `/qa <task>`: a ticket key, a link to a specification, an area such as
"cover the cart", a failing test, "review this branch" or "what is not covered". The orchestrator picks the flow and
runs each role as its own agent:

| Role                   | Does                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `qa-planner`           | Turns the task into a contract of test cases under `.qa/contracts/`, which a person approves |
| `qa-explorer`          | Maps pages and API operations on the stand, read-only                                        |
| `qa-coverage`          | Lists what the tests cover and ranks the gaps                                                |
| `qa-automation-expert` | Implements an approved contract and leaves a run record                                      |
| `qa-judge`             | Checks the expert's tests and proves that they fail when an expected value is broken         |
| `qa-healer`            | Repairs failing tests in page objects and data, never by changing an expected value          |
| `qa-reviewer`          | Reviews the diff against the framework rules and the definition of done                      |

`/qa-plan`, `/qa-implement`, `/qa-review`, `/qa-heal`, `/qa-explore` and `/qa-coverage` run one role. The rules every
test follows are in the `framework-rules` skill; the read-only agents are held to their commands by the hook.

## Clean up the working files

The agents' working files under `.qa/` are git-ignored and exist only on the machine of whoever worked, so CI cannot
remove them: contracts (`.qa/contracts/`), run records (`.qa/runs/`), judge verdicts (`.qa/judge/`), explorer,
coverage and healer reports (`.qa/reports/`) and probes (`.qa/probes/`). `/qa`, `/qa-plan` and `/qa-coverage` start by
running

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
