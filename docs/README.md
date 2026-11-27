# Documentation

This is the documentation of `@virtocommerce/test-automation-framework`, a Playwright Test framework for the test
suites of Virto Commerce-based solutions. It ships with the package, so it always matches the installed version.

## Terms

| Term       | Meaning                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| Framework  | This package: what is the same on every Virto Commerce platform.                                       |
| Solution   | A company's Virto Commerce-based platform, with its modules, stores and frontends.                     |
| Test suite | The tests for one solution. It installs the framework and adds its own clients, page objects and data. |

## Start here

- [Getting started](getting-started.md): set up a test suite and write its first test.
- [Generating types](guides/generating-types.md): generate types from the GraphQL schema and the OpenAPI documents.
- [QA agents](guides/qa-agents.md): install the Claude Code agents that plan, write, check and heal the tests.

## Concepts

- [Areas](concepts/areas.md): the entry points of the package and what each one contains.
- [Secrets](concepts/secrets.md): how passwords and tokens are kept out of output.
- [Environment](concepts/environment.md): the environment variables and how a test suite extends them.
- [Modules](concepts/modules.md): the installed platform modules and the module requirements of tests and data.
- [HTTP](concepts/http.md): the HTTP client, its responses and its errors.
- [Authentication](concepts/auth.md): platform sign-in, token renewal, sign-out and browser sessions.
- [GraphQL](concepts/graphql.md): the GraphQL client, typed documents and GraphQL errors.
- [Dataset](concepts/dataset.md): the data of a test suite, its manifest, and how it is loaded and seeded.
- [Playwright config](concepts/config.md): run options, projects, `use` options and reporting.
- [Fixtures](concepts/fixtures.md): the default Playwright fixtures, module requirements and browser sessions.

## Documentation comments

Every exported member has a documentation comment, and the build fails when one does not. Editors show it when you
hover over a member.

## Contributing to the framework

- [Architecture](contributing/architecture.md): areas, their dependencies and how the boundaries are enforced.
- [Conventions](contributing/conventions.md): naming, documentation comments, tests and error handling.
- [Documentation](contributing/documentation.md): how this documentation is structured and kept accurate.
- [Releasing](contributing/releasing.md): versions, changesets and publishing.
