# Architecture

## Repository layout

| Path             | Contains                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------ |
| `src/<area>/`    | The framework, one directory for each area, each with an `index.ts` that is its public API |
| `tests/unit/`    | The unit tests of the framework, one directory for each area                               |
| `docs/`          | This documentation, shipped with the package                                               |
| `virtocommerce/` | The test suite of the Virto Commerce solution, which uses the framework like any suite     |
| `.biome/`        | The shared Biome configuration and the area boundaries                                     |
| `.claude/`       | The QA agents, their commands, skills and check scripts, and the guidance for Claude Code  |
| `.qa/`           | `project.json`, the facts the QA agents work from; their working files are not committed   |
| `scripts/`       | Repository scripts, such as the documentation check                                        |
| `tools/`         | Tools with their own dependencies, such as TypeDoc                                         |

The package publishes only `dist`, `docs`, the shared Biome configuration and the changelog. `virtocommerce/`,
`tests/`, `src/`, `.claude/` and `.qa/` are never published.

The QA agents work on one test suite, which `suiteDir` in `.qa/project.json` names: `virtocommerce` here. Their
check scripts in `.claude/checks/` import nothing from `src/` or from a test suite, so a partner's repository can take
them over with its own `project.json`.

The repository has one `package.json`, which is also the framework package. The `virtocommerce` test suite lives in
this repository, so that the CI pipelines of the Virto Commerce platform, frontend and modules run it against the
current framework. Its scripts end in `:vc`, and the tools that only it uses, such as the report generator and the type
generators, are dev dependencies; consumers of the package do not install them.

## Areas and their boundaries

Each area may import only the areas listed for it:

| Area       | May import                                   |
| ---------- | -------------------------------------------- |
| `core`     | no other area                                |
| `http`     | `core`                                       |
| `auth`     | `core`, `http`                               |
| `graphql`  | `core`, `http`                               |
| `modules`  | `core`, `http`                               |
| `dataset`  | `core`, `http`, `modules`                    |
| `fixtures` | `core`, `http`, `auth`, `graphql`, `modules` |

- Inside an area, files import each other by relative paths with the `.ts` extension.
- Areas import each other only through the alias of the other area, such as `@/core`, which resolves to that area's
  `index.ts`. An area cannot reach into another area's files.
- Tests import the framework only through the aliases, so they test the public API.
- The framework never imports the `virtocommerce` test suite. The test suite imports the framework only by its package
  name, such as `@virtocommerce/test-automation-framework/core`, exactly as a partner's test suite does.
- The framework imports only its peer dependencies and Node built-ins, which a test suite is sure to have. A dev
  dependency, such as a tool that only the `virtocommerce` test suite uses, cannot be imported in `src`.

Biome enforces these rules with the overrides in `.biome/layers.json`, which is maintained by hand. A new area needs
its own entry there, listing the areas it may import. An area that is not listed is blocked for all others, because
each rule allows only named exceptions.

## Build

`npm run build` compiles `src` to `dist` with declarations and source maps, then rewrites the `@/` aliases to relative
paths. CI fails when an alias remains in `dist`.

The `virtocommerce` test suite and the documentation examples map the package name to `src` in their own
`tsconfig.json`, so they run against the current source without a build. Only scripts that plain Node runs, such as
`codegen:vc`, load the framework through its `exports`, so `codegen:vc` builds the framework first.
