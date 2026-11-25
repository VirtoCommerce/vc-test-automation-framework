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

`vc-qa-agents` copies the agents, commands, skills, check scripts and hook into `.claude/`, replacing the copies of
an earlier version. It creates `.claude/settings.json` with the read-only shell hook and `.qa/project.json` from an
example, but never changes either one once it exists, and it lists the `.gitignore` entries that are missing. Run it
again after you upgrade the package. Commit `.claude/` and `.qa/project.json`; the other files under `.qa/` are the
agents' working files.

The check scripts are TypeScript, run by Node 22.18 or newer without a build, and parse specs with `@babel/parser`.

## Describe your repository

Replace the example values in `.qa/project.json`, then check it with `node .claude/checks/project-facts.mts`, which
prints the facts or the problems with them. Every agent reads the file through that command and stops when it fails.

Besides the shape of each field, the command refuses a file that is still the template's: an account in the example
domain or the `PROJ` tracker key. It also checks the file against the repository: every `npm run` script of a command
exists in `package.json`, every key of `commands.test` (except `unit` and `all`) and of `quality.durationBudgetMs` is a
project of the suite's `playwright.config`, and every `healerPaths` entry is a directory. A config whose projects it
cannot read statically is noted on stderr and its project names are not checked.

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
