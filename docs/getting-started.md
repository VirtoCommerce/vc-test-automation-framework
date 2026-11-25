# Getting started

This guide sets up a test suite for a Virto Commerce-based solution and runs its first test. The `virtocommerce`
directory of the framework repository is a complete test suite that follows the same setup.

## Start from the template

In an empty directory, `npx vc-qa-agents init` writes a test suite that runs:

```shell
npm init -y
npm install --save-dev --save-exact @virtocommerce/test-automation-framework
npx vc-qa-agents init
```

It adds the scripts to `package.json`, installs the peer dependencies and Chromium, and installs the
[QA agents](guides/qa-agents.md) with a `.qa/project.json` that matches the suite. It never overwrites a file that
exists; `--skip-install` leaves the dependencies out.

| Path                      | Holds                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `playwright.config.ts`    | The projects `restapi`, `graphql` and `e2e-frontend`, with the Allure reporter      |
| `env.ts`, `.env`          | The environment schema, with `FRONTEND_BASE_URL` and `STORE_ID` on the framework's  |
| `fixtures/index.ts`       | `test` and `expect`: the default fixtures plus `user`, `api`, `arrange`, `shopper`  |
| `arrange/`                | The `arrange` factory, which removes test data after the test, and a first domain   |
| `builders/`, `support/`   | Payload builders, `requireFields`, `uniqueId`, the store and the shopper            |
| `codegen.ts`, `scripts/`  | GraphQL and REST type generation from the running platform                          |
| `tests/restapi/security/` | The first test: a user that `arrange` creates signs in                              |
| `CLAUDE.md`, `biome.json` | The suite's layout and code style for the agents, and the shared Biome preset       |
| `pages/`                  | A README for the page objects, which the first browser test fills                   |
| `.mcp.json`               | The Playwright MCP server of the agents, see [Browser](guides/qa-agents.md#browser) |

Then:

```shell
npm run codegen                         # GraphQL and REST types from the platform in .env
npm test                                # every project
npm run report && npm run report:open   # the Allure report
```

### A suite in a subdirectory

A repository that keeps the suite as its own npm project in a subdirectory gives `init` that directory, run from the
repository root with the package installed in the subdirectory:

```shell
mkdir tests-suite && cd tests-suite
npm init -y
npm install --save-dev --save-exact @virtocommerce/test-automation-framework
cd ..
npm exec --prefix tests-suite -- vc-qa-agents init tests-suite
```

The suite's files, its `package.json` and its dependencies go to `tests-suite/`; the agents (`.claude/`),
`.qa/project.json` and `.mcp.json` stay at the root, where Claude Code must be opened, and the facts name the
directory as `suiteDir` (see [Where the suite lives](guides/qa-agents.md#where-the-suite-lives)). Run the commands
above in `tests-suite/`.

The rest of this guide sets a suite up by hand, piece by piece.

## Install the framework

Follow the installation steps in the [package README](../README.md#installation), then install the peer dependencies:

```shell
npm install --save-dev @playwright/test zod @types/node
```

## Configure TypeScript

The package publishes one entry point for each area, such as `@virtocommerce/test-automation-framework/core`.
TypeScript resolves them with the `nodenext` module resolution. Playwright runs the TypeScript files directly, so the
test suite does not emit JavaScript and can import its own files with the `.ts` extension:

```json
{
  "compilerOptions": {
    "target": "es2024",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "types": ["node"]
  }
}
```

## Describe the environment

The framework defines the environment variables that every solution needs. Put their values in a `.env` file, which
must not be committed:

```ini
BACKEND_BASE_URL=https://platform.example.com
ADMIN_USERNAME=admin
ADMIN_PASSWORD=...
```

Load the file before the tests run, for example with `process.loadEnvFile()` in the Playwright configuration. See
[Environment](concepts/environment.md) for every variable and for adding your own.

## Write the first test

The test signs in the platform administrator and reads the current user:

<!-- example: examples/getting-started.ts -->
```ts
import { expect, request, test } from "@playwright/test";
import { TokenClient, TokenManager } from "@virtocommerce/test-automation-framework/auth";
import { envSchema, parseEnv } from "@virtocommerce/test-automation-framework/core";
import { HttpClient } from "@virtocommerce/test-automation-framework/http";

const env = parseEnv(envSchema);

test("the administrator can read the current user", async () => {
  const context = await request.newContext({ ignoreHTTPSErrors: !env.VERIFY_SSL, timeout: env.REQUEST_TIMEOUT_MS });
  const anonymous = new HttpClient(context, env.BACKEND_BASE_URL);
  const tokens = new TokenManager(new TokenClient(anonymous));

  try {
    const admin = await tokens.signIn(anonymous, { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD });
    const response = await admin.get("/api/platform/security/currentuser");

    expect(response.json<{ userName: string }>().userName).toBe(env.ADMIN_USERNAME);
  } finally {
    await tokens.signOutAll();
    await context.dispose();
  }
});
```

Run it with `npx playwright test`.

## Share the code style

The package ships its [Biome](https://biomejs.dev) configuration, so test suites format and lint code the same way as
the framework. Install Biome and extend the preset in your `biome.json`:

```shell
npm install --save-dev @biomejs/biome
```

```json
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "extends": ["@virtocommerce/test-automation-framework/biome"],
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "includes": ["**"] }
}
```

The preset combines three parts, which you can also extend one by one:

| Part                                                       | Contains                                          |
| ---------------------------------------------------------- | ------------------------------------------------- |
| `@virtocommerce/test-automation-framework/biome/formatter` | Formatting: indentation, line width, line endings |
| `@virtocommerce/test-automation-framework/biome/rules`     | Lint rules                                        |
| `@virtocommerce/test-automation-framework/biome/imports`   | Import grouping and order                         |

Rules set in your own `biome.json` override the preset's, for example the import boundaries of your test suite.
