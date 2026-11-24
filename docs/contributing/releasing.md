# Releasing

## Development commands

```shell
npm ci                 # install dependencies
npm run typecheck      # type-check the framework, the virtocommerce test suite and the documentation examples
npm run check          # format, lint and sort imports, with fixes
npm run test:unit      # run the unit tests of the framework
npm run docs:check     # check the documentation links and examples
npm run build          # compile src to dist
```

The scripts of the `virtocommerce` test suite end in `:vc`:

```shell
npm run codegen:vc     # build the framework, then generate the GraphQL and REST types
npm run seed:vc        # seed the dataset into the platform
npm run test:vc        # run the test suite, without the destructive tests
npm run test:vc:isolated  # run the destructive tests alone, after test:vc
npm run test:vc:unit   # check the dataset: unique ids, references that resolve, seed order; no platform needed
npm run facts:check    # check that the role permissions in .qa/project.json match the seed
npm run report:vc      # generate the Allure report from the last run
```

The seed turns off the platform's scheduled indexing, so that a scheduled run cannot refuse an indexation that a test
starts. Rebuild the index by hand after seeding a local platform; the shared CI workflow indexes after its seed.

The destructive tests of the `isolated` project change global settings, such as anonymous access to the store, and
rebuild the search index, so they would break tests that run at the same time. `test:vc` always leaves them out, and
`test:vc:isolated` runs them in a separate run with one worker. They run only when `RUN_DESTRUCTIVE_TESTS` is on,
so set it only for an environment that may lose its settings, such as a platform made for one CI run. Run
`test:vc:isolated` after `test:vc`, without cleaning the results in between, and the report covers both runs.

The `Auto Tests Docker` workflow (`auto-tests.yml`) runs the test suite on GitHub Actions; start it from the Actions
tab. It calls `playwright-tests.yml` of `VirtoCommerce/.github`, the workflow that the platform, the frontends and
the modules also run against this repository's `dev` branch. For each database and search engine it starts a platform
with the modules of `virtocommerce/backend-packages.json` and a frontend, writes `virtocommerce/.env` from the
`VC_TESTING_MODULE_ENV_FILE_NEW` secret, seeds and indexes the dataset, runs each chosen project with
`--config=virtocommerce`, and uploads the Allure report. The suites it accepts are the project names: `restapi`,
`graphql`, `e2e-frontend`, `e2e-backend` (`e2e` is both) and `isolated`, which also needs
`RUN_DESTRUCTIVE_TESTS=true` in the secret. Since that workflow is shared, a project's name is a contract with every
caller: renaming one breaks their CI. The callers leave out the tests tagged `@platform-defect`, so a defect that a
ticket tracks does not fail their checks; `auto-tests.yml` runs them, unless its `skipPlatformDefects` input is on.

The `CI` workflow runs on every pull request to `dev`: the type check, Biome, the unit tests of the framework, the
dataset checks of the test suite, the documentation check, the API reference and the build. It needs no platform.

## Versions

While the version is `0.x`, any minor release may contain breaking changes. Every change that consumers see is
described in `CHANGELOG.md`.

## Releasing a version

Releases are made by GitHub Actions with [Changesets](https://github.com/changesets/changesets):

1. A pull request that changes what consumers get adds a changeset (`npm run changeset`). See
   [the changeset guide](../../.changeset/README.md) for how to choose the bump and write the note. A pull request
   with nothing for consumers adds an empty changeset (`npx changeset --empty`).
2. Merging to `dev` opens or updates the "chore: release" pull request, which bumps the version and updates
   `CHANGELOG.md`.
3. Merging that pull request publishes the package to GitHub Packages and creates the GitHub release.

When no changesets are pending, a merge to `dev` publishes the current version if it is not yet in the registry.
