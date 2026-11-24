# QA agents

The package ships a set of QA agents for [Claude Code](https://claude.com/claude-code) that plan, write, check, heal
and review the tests of a test suite built on the framework. They work for any solution: what they need to know about
your repository (where the suite is, the commands, the test projects, the roles and accounts, the tracker) comes from
one file, `.qa/project.json`.

## Install

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
prints the facts or the first field that is wrong. Every agent reads the file through that command and stops when it
fails.

| Field             | Holds                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| `suiteDir`        | The directory of the test suite with its own `playwright.config.ts` and `.env`; `.` for the root |
| `tracker`         | The tracker kind, the pattern of its keys and the routes the agents may read a ticket by         |
| `docSources`      | Where the agents look up how the product should behave                                           |
| `commands`        | The type check, the lint and one test command for each Playwright project, plus `unit` and `all` |
| `critical`        | The flows that coverage ranks first                                                              |
| `roles`           | The data roles of the tests, each with its account                                               |
| `roleFor`         | Which role administers (`admin`), which is a customer, and optionally which is another customer  |
| `rolePermissions` | The permissions of each role, for security tests                                                 |
| `passwordFor`     | The environment variable that holds each role's password                                         |
| `quality`         | Limits on the size of a test, the stable series and the time budget of each project              |
| `autonomy`        | Whether the healer may apply a fix (`apply`) or only propose it (`propose`), by area             |
| `healerPaths`     | The directories the healer may change: page objects and test data, never the specs               |

The prompts name no solution: `node .claude/checks/scan-prompts.mts` checks that the shipped files hold none of the
facts' accounts, role names or hosts.

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
