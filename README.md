# @virtocommerce/test-automation-framework

A Playwright Test framework for the API and browser test suites of Virto Commerce-based solutions. It holds what is the
same on every Virto Commerce platform. Each solution's test suite installs it as an npm package and adds its own code
on top: API clients, page objects, test data and tests.

> **Status: early development.** While the version is `0.x`, any minor release may contain breaking changes. Read
> [CHANGELOG.md](CHANGELOG.md) before upgrading.

## Requirements

- Node.js 22.18 or newer
- `@playwright/test` 1.65.1 or newer and `zod` 4.0.7 or newer, installed in your repository
- `@types/node` in your repository, since the framework's types use Node types such as `Buffer`
## Installation

The package is published to the public npm registry, so installing it needs no token:

```shell
npm install --save-dev @virtocommerce/test-automation-framework
```

Every version carries an npm provenance attestation that ties it to the GitHub Actions run that published it;
`npm audit signatures` checks it.

## Start a test suite

In an empty directory, `init` writes a test suite that runs, installs its dependencies and the QA agents, asks for the
URLs and logins of your stand, and prints a table of what works:

```shell
npm init -y
npm install --save-dev --save-exact @virtocommerce/test-automation-framework
npx vc-qa-agents init
```

Then run `claude` in the directory. `npm test` and `npm run report` run the tests and build the Allure report. See
[Getting started](docs/getting-started.md#start-from-the-template).

## Documentation

The documentation ships with the package, in `node_modules/@virtocommerce/test-automation-framework/docs`, so it
always matches the installed version.

- [Getting started](docs/getting-started.md): set up a test suite and write its first test.
- [QA agents](docs/guides/qa-agents.md): install the Claude Code agents that generate and maintain the tests.
- [Documentation index](docs/README.md): concepts, terms and contributing to the framework.

## Entry points

| Entry point                                         | Contains                                                                                                    |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `@virtocommerce/test-automation-framework/core`     | Secrets and masking, string schemas, the environment variables and their parsing, Playwright config helpers |
| `@virtocommerce/test-automation-framework/graphql`  | The GraphQL client, its results and errors, and the configuration for generating typed documents            |
| `@virtocommerce/test-automation-framework/http`     | The HTTP client, its responses and its errors                                                               |
| `@virtocommerce/test-automation-framework/auth`     | Platform sign-in: credentials, access tokens, the token client and manager, and browser sessions            |
| `@virtocommerce/test-automation-framework/modules`  | The modules installed on the platform and the module requirements of tests and dataset collections          |
| `@virtocommerce/test-automation-framework/dataset`  | Loading a dataset from JSON files and seeding it into the platform, driven by a manifest                    |
| `@virtocommerce/test-automation-framework/fixtures` | The default Playwright fixtures: clients, signed-in users, module requirements and browser sessions         |

Only what an entry point exports is public API. Modules that an entry point does not export can change in any release.

## This repository

Besides the framework, the repository holds the Virto Commerce test suite in `virtocommerce/`, which uses the
framework like any other suite, and the QA agents for Claude Code in `.claude/`, which the package ships. See
[virtocommerce/README.md](virtocommerce/README.md) for running the suite, and
[the architecture page](docs/contributing/architecture.md) for how the repository is laid out.
