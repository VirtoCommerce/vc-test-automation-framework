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
`graphql`, `e2e-frontend`, `e2e-backend` (`e2e` is both; `all`, the default, is `graphql`, `restapi` and `e2e`) and
`isolated`, which also needs `RUN_DESTRUCTIVE_TESTS=true` in the secret. Since that workflow is shared, a project's name is a contract with every
caller: renaming one breaks their CI. The callers leave out the tests tagged `@platform-defect`, so a defect that a
ticket tracks does not fail their checks; `auto-tests.yml` runs them, unless its `skipPlatformDefects` input is on.

The `CI` workflow runs on every pull request to `dev` and `main`, on Node 22.18 and the current Node: the type check,
Biome, the unit tests of the framework, the dataset checks of the test suite, the documentation check and the build,
which fails when an `@/` alias is left in `dist`. Its `changeset` job fails a pull request to `dev` without a
changeset. It needs no platform.

## Versions

While the version is `0.x`, any minor release may contain breaking changes. Every change that consumers see is
described in `CHANGELOG.md`.

## Releasing a version

The `Release` workflow publishes the package to npm. Where it publishes from decides what you get:

| Where            | When        | Install with | Version example              |
| ---------------- | ----------- | ------------ | ---------------------------- |
| a feature branch | you run it  | `@alpha`     | `0.2.0-alpha.20261125103000` |
| `dev`            | every merge | `@next`      | `0.2.0-next.20261125103000`  |
| `main`           | every merge | `@latest`    | `0.2.0`                      |

The version comes from the changesets: each pull request that changes what consumers get adds one with
`npm run changeset` ([how to write one](../../.changeset/README.md)); a pull request with nothing for consumers adds
an empty one with `npx changeset --empty`. No pending changesets, nothing is published.

To release:

1. Merge your pull requests into `dev`. Each merge publishes a `next` version to try.
2. When `dev` is ready, merge it into `main` with a pull request (merge commit only).
3. The rest is automatic: the `vc-ci` bot bumps the version, updates `CHANGELOG.md`, publishes `latest`, tags
   `v<version>`, creates the GitHub release and merges `main` back into `dev`.

To try a feature branch before merging it, run `Release` on it from the Actions tab, or with
`gh workflow run release.yml --ref <branch>`.

If the last step fails because `main` does not merge into `dev` cleanly, merge it by hand; the release itself is
already published.

### How it works

- Alpha and `next` versions commit nothing; the changesets stay in place until the release.
- `dev` and `main` take changes only through pull requests with green CI. The bot pushes past that with the
  `REPO_TOKEN` secret, as the repository admin role is allowed to.
- npm sign-in uses Trusted Publishing: no npm token is stored, and every version gets a provenance attestation. The
  trusted publisher on npmjs.com is tied to the file name `release.yml`, so keep every publish in that file and do not
  rename it.
