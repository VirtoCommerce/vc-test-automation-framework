# Getting started

This guide sets up a test suite for a Virto Commerce-based solution and runs its first test. The `virtocommerce`
directory of the framework repository is a complete test suite that follows the same setup.

## Start from the template

In an empty directory, `npx vc-qa-agents init` writes a test suite, asks for what it needs to reach your stand, and
ends with a table of what works:

```shell
npm init -y
npm install --save-dev --save-exact @virtocommerce/test-automation-framework
npx vc-qa-agents init
```

`init` adds the scripts to `package.json`, installs the peer dependencies and Chromium, installs the
[QA agents](guides/qa-agents.md) with a `.qa/project.json` that matches the suite, asks the questions below, writes
`.env`, generates the types and runs the first test. It never overwrites a file that exists, nor an agent, command or
skill of the repository's own (see [Update and remove](guides/qa-agents.md#update-and-remove)).

| Path                      | Holds                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `playwright.config.ts`    | The projects `restapi`, `graphql` and `e2e-frontend`, with the Allure reporter      |
| `env.ts`, `.env`          | The environment schema, with `FRONTEND_BASE_URL` and `STORE_ID` on the framework's  |
| `fixtures/index.ts`       | `test` and `expect`: the default fixtures plus `user`, `api`, `arrange`, `shopper`  |
| `arrange/`                | The `arrange` factory, which removes test data after the test, and a first domain   |
| `builders/`, `support/`   | Payload builders, `requireFields`, `uniqueId`, the store and the shopper            |
| `codegen.ts`, `scripts/`  | GraphQL and REST type generation from the running platform                          |
| `tests/restapi/security/` | The first test, which only reads, and `create-user.example.ts`, which writes        |
| `CLAUDE.md`, `biome.json` | The suite's layout and code style for the agents, and the shared Biome preset       |
| `pages/`                  | A README for the page objects, which the first browser test fills                   |
| `.mcp.json`               | The Playwright MCP server of the agents, see [Browser](guides/qa-agents.md#browser) |

### What `init` asks

In a terminal, `init` asks once for each of these and writes the answers to `.env` and `.qa/project.json`:

1. The backend URL, the frontend URL and the store (`BACKEND_BASE_URL`, `FRONTEND_BASE_URL`, `STORE_ID`).
2. The administrator's login (`ADMIN_USERNAME`, `admin` by default) and password.
3. The login of a customer and of another customer, with their passwords. The logins go to `roles` in
   `.qa/project.json`; the passwords go to `.env`.
4. The tracker and the pattern of its ticket keys.
5. The attribute that marks an element for tests, `data-test-id` by default. It is `FRONTEND_TEST_ID_ATTRIBUTE` in
   `.env`, which `playwright.config.ts` passes to `defaultUse` as `testIdAttribute`; a suite that keeps
   `defaultUse(env)` uses `data-test-id`.

Passwords are typed with hidden input. A value that is already set is not asked again: a key that is not empty in
`.env`, or a role or tracker in `.qa/project.json` that you changed from the template, stays as it is, so running
`init` again is safe.

`init` then installs the dependencies and prints a table with one row for each check: `backend` and `frontend` answer,
`administrator` can sign in, `project facts` pass, `types` are generated, `first test` passes and `browser server`
starts. A failing row names the single fix. `init` exits with 0 once it has written its files, whatever the table says,
because a platform that is still starting needs a minute; it exits with 1 only when it could not do its own work. When
the platform does not answer, the types and the first test are skipped. If the backend uses a self-signed certificate,
`init` asks whether to set `VERIFY_SSL=false`.

The last line tells you to run `claude` in the directory. Claude Code asks once whether to approve the `playwright`
server of `.mcp.json`; approve it, and the agents can open the frontend.

### Without a terminal

When there is no terminal (CI, or an agent runs `init`) or you pass `--yes`, `init` asks nothing. It takes the values
from flags and from the shell, and a value still missing keeps the template's default or stays empty, which the table
shows as a failing row with the fix:

```shell
ADMIN_PASSWORD=... CUSTOMER_PASSWORD=... OTHER_CUSTOMER_PASSWORD=... \
  npx vc-qa-agents init --yes \
  --backend-url https://platform.example.com --frontend-url https://shop.example.com --store-id B2B-store \
  --customer customer@example.com --other-customer other@example.com
```

| Flag                              | Sets                                                                        |
| --------------------------------- | --------------------------------------------------------------------------- |
| `--backend-url`, `--frontend-url` | `BACKEND_BASE_URL`, `FRONTEND_BASE_URL`                                     |
| `--store-id`                      | `STORE_ID`                                                                  |
| `--admin-login`                   | `ADMIN_USERNAME`                                                            |
| `--customer`, `--other-customer`  | The logins of the customer and of the other customer in `.qa/project.json`  |
| `--tracker`, `--key-pattern`      | The tracker kind and the pattern of its ticket keys                         |
| `--test-id-attribute`             | `FRONTEND_TEST_ID_ATTRIBUTE`                                                |
| `--yes`                           | Asks nothing, even in a terminal                                            |
| `--save-passwords`                | Writes the passwords that came from the shell to `.env`                     |
| `--skip-verify`                   | Makes no request: skips the reachability rows, the types and the first test |
| `--skip-install`                  | Leaves the dependencies out, and with them the types and the first test     |
| `--force-ours`                    | Replaces the agent files you edited                                         |

A value that starts with `--` is written `--flag=value`, because `--flag --value` reads as two flags.

**Passwords are never flags**, so they stay out of the shell history and the process list. Typed passwords go to
`.env`. Passwords that come from the shell variables `ADMIN_PASSWORD`, `CUSTOMER_PASSWORD` and
`OTHER_CUSTOMER_PASSWORD` are used for the run only and stay in the shell, unless you pass `--save-passwords`; the
table says "Passwords from the shell, not saved" so that a failure in a new terminal is no surprise.

### Check it again

```shell
npx vc-qa-agents doctor
```

`doctor` prints the same table without writing anything, for example after a change to `.env` or when the platform was
down during `init`. It exits with 1 when a row fails, so CI can use it, and `--skip-verify` makes it offline. It needs
the agents' check scripts, so run `npx vc-qa-agents` first in a suite that does not have them.

### Run the tests

```shell
npm test                                # every project
npm run report && npm run report:open   # the Allure report
```

`init` already ran `npm run codegen`; run it again when the modules of the platform change. The first test,
`tests/restapi/security/sign-in.spec.ts`, only reads: the administrator signs in and the platform names that user, so
it is safe on any stand. `create-user.example.ts` in the same directory is the example of a test that writes: `arrange`
creates a user and removes it after the test. Rename it to `.spec.ts` to run it on a stand where writing is allowed.

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
