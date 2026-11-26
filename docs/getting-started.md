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

`init` adds its scripts to `package.json` without replacing yours, installs the suite's dev dependencies (Playwright,
zod, TypeScript, Biome, Allure, the GraphQL and REST type generators, `@babel/parser`) at the versions the framework
uses, installs Chromium and the browser of the agents' browser server (`npx -y @playwright/mcp@0.0.84 install-browser chrome-for-testing`, whose output is kept back: `init` prints one line saying it was installed, or why not, and leaves a failure to the `browser server` row), installs the [QA agents](guides/qa-agents.md) with a `.qa/project.json` that matches the
suite, asks the questions below, writes `.env`, generates the types and runs the first test. It never overwrites a
file that exists, nor an agent, command or skill of the repository's own (see
[Update and remove](guides/qa-agents.md#update-and-remove)). An unknown command or option fails with the usage.

| Path                                                              | Holds                                                                                   |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `playwright.config.ts`                                            | The projects `restapi`, `graphql` and `e2e-frontend`, with the Allure reporter          |
| `env.ts`, `.env`, `.env.example`                                  | The environment schema, with `FRONTEND_BASE_URL` and `STORE_ID` on the framework's      |
| `fixtures/index.ts`                                               | `test` and `expect`: the default fixtures plus `user`, `api`, `arrange`, `shopper`      |
| `arrange/`                                                        | The `arrange` factory, which removes test data after the test, and a first domain       |
| `builders/`, `support/`                                           | Payload builders, `requireFields`, `uniqueId`, the store and the shopper                |
| `codegen.ts`, `scripts/`                                          | GraphQL and REST type generation from the running platform                              |
| `tests/restapi/security/`                                         | The first test, which only reads, and `create-user.example.ts`, which writes            |
| `pages/`                                                          | A README for the page objects, which the first browser test fills                       |
| `CLAUDE.md`, `biome.json`                                         | The suite's layout and code style for the agents, and the shared Biome preset           |
| `.mcp.json`                                                       | The Playwright MCP server of the agents, see [Browser](guides/qa-agents.md#browser)     |
| `tsconfig.json`, `allurerc.mjs`, `.gitignore`, `.qa/project.json` | TypeScript with the suite's aliases, the Allure settings, ignores and the agents' facts |

### What `init` asks

In a terminal, `init` asks once for each of these and writes the answers to `.env` and `.qa/project.json`:

1. The backend URL, the frontend URL and the store (`BACKEND_BASE_URL`, `FRONTEND_BASE_URL`, `STORE_ID`).
2. The administrator's login (`ADMIN_USERNAME`) and password.
3. The login of a customer and of another customer, with their passwords. The logins go to `roles` in
   `.qa/project.json`; the passwords go to `.env`. The customer is required, because the tests sign in to the frontend
   as that customer: a blank answer is asked again. The other customer, who tests that one customer cannot reach
   another's data, may be left empty when the stand has none; `init` then removes that role from `roles`, `roleFor`
   and `passwordFor` and does not ask for its password.
4. The tracker, which has no default and must be answered, and the pattern of its ticket keys. `init` checks both as
   `.qa/project.json` does and asks again with the reason: one tracker only (enter the main one, not a list), and a
   pattern that matches a key of that tracker, such as `ABC-123` for `jira` or a numeric id for `azure-boards`. A
   `--tracker` or `--key-pattern` flag that fails the same check stops `init` before it writes anything.
5. Where your project's own documentation is: a URL, `mcp:<server name>`, or what to ask a person for. The agents
   read it before the public Virto Commerce documentation, which stays in `docSources` after it. An empty answer skips
   the question.
6. The attribute that marks an element for tests, `data-test-id` by default. It is `FRONTEND_TEST_ID_ATTRIBUTE` in
   `.env`, which `playwright.config.ts` passes to `defaultUse` as `testIdAttribute`; a suite that keeps
   `defaultUse(env)` uses `data-test-id`.

Passwords are typed with hidden input. A value that is already set is not asked again: a key that is not empty in
`.env`, or a role, tracker or `docSources` in `.qa/project.json` that you changed from the template, stays as it is, so running
`init` again is safe. A flag for a key that `.env` already holds is not applied, and `init` prints one line saying so;
edit `.env` to change that value.

The new `.env` holds no stand values: each key is empty, with an example and the format in the comment above it. A value you leave blank stays empty, and the readiness table names it.

`init` then installs the dependencies and prints a table with one row for each check: `backend` and `frontend` answer,
`administrator` can sign in, `project facts` pass, `types` are generated, `first test` passes and `browser server`
starts. Before each check it prints one line, such as `checking the types (npm run codegen)…`, because codegen, the
first test and the browser server can take minutes; the table follows once every row is done. A backend or frontend
that does not answer at once is tried again for about two minutes, each attempt waiting up to 20 seconds, so that a
cloud stand can start; `init` prints `waiting for <origin> to answer…` once while it waits. A failing row names the
single fix. `init` exits with 0 once it has written its files, whatever the table says,
because a platform that is still starting needs a minute; it exits with 1 only when it could not do its own work. When
the platform does not answer, the types and the first test are skipped. If the backend uses a self-signed certificate,
`init` asks whether to set `VERIFY_SSL=false`. That setting holds for the whole run: the types, the first test and the
browser server accept the certificate too. A certificate issued for another host name is a failing row of its own:
use in `.env` the host name the certificate names.

When every row passes, the last line tells you to run `claude` in the directory. Claude Code asks once whether to
approve the `playwright` server of `.mcp.json`; approve it, and the agents can open the frontend. With a failing or a
skipped row, the last lines say `Not ready:` and list the failing rows, or say `Not verified:` and name each skipped
row with its reason, followed by `Run npx vc-qa-agents doctor once that is fixed.`: a skipped row has not been checked,
so it is not ready.

### Without a terminal

When there is no terminal (CI, or an agent runs `init`) or you pass `--yes`, `init` asks nothing; without a terminal and
without `--yes` it prints one line saying so. It takes the values
from flags and from the shell, and a value still missing keeps the template's default or stays empty, which the table
shows as a failing or skipped row. Without `--other-customer` the other customer stays the template's example account,
so the `project facts` row fails until you run `init` in a terminal and leave it empty, or remove that role by hand. Set the passwords in the environment first, from the secret store of your CI or
without typing the value on the command line, so that it stays out of the shell history:

```shell
read -rs ADMIN_PASSWORD && export ADMIN_PASSWORD
read -rs CUSTOMER_PASSWORD && export CUSTOMER_PASSWORD
read -rs OTHER_CUSTOMER_PASSWORD && export OTHER_CUSTOMER_PASSWORD
```

```powershell
$env:ADMIN_PASSWORD = Read-Host -MaskInput "ADMIN_PASSWORD"
$env:CUSTOMER_PASSWORD = Read-Host -MaskInput "CUSTOMER_PASSWORD"
$env:OTHER_CUSTOMER_PASSWORD = Read-Host -MaskInput "OTHER_CUSTOMER_PASSWORD"
```

Then run `init` on its own line:

```shell
npx vc-qa-agents init --yes \
  --backend-url https://platform.example.com --frontend-url https://shop.example.com --store-id B2B-store \
  --customer customer@example.com --other-customer other@example.com
```

| Flag                              | Sets                                                                        |
| --------------------------------- | --------------------------------------------------------------------------- |
| `--backend-url`, `--frontend-url` | `BACKEND_BASE_URL`, `FRONTEND_BASE_URL`, each an origin: no path or query   |
| `--store-id`                      | `STORE_ID`                                                                  |
| `--admin-login`                   | `ADMIN_USERNAME`                                                            |
| `--customer`, `--other-customer`  | The logins of the customer and of the other customer in `.qa/project.json`  |
| `--tracker`, `--key-pattern`      | The tracker kind and the pattern of its ticket keys                         |
| `--docs`                          | Your documentation: a URL, `mcp:<name>` or text, first in `docSources`      |
| `--test-id-attribute`             | `FRONTEND_TEST_ID_ATTRIBUTE`                                                |
| `--yes`                           | Asks nothing, even in a terminal                                            |
| `--save-passwords`                | Writes the passwords that came from the shell to `.env`                     |
| `--skip-verify`                   | Makes no request: skips the reachability rows, the types and the first test |
| `--skip-install`                  | Leaves the dependencies out, and with them the types and the first test     |
| `--force-ours`                    | Replaces the agent files you edited                                         |

A value that starts with `--` is written `--flag=value`, because `--flag --value` reads as two flags.

**Passwords are never flags**; set them in the environment, not on the command line, so they stay out of the shell
history and the process list. Typed passwords go to `.env`. Passwords that come from the shell variables `ADMIN_PASSWORD`, `CUSTOMER_PASSWORD` and
`OTHER_CUSTOMER_PASSWORD` are used for the run only and stay in the shell, unless you pass `--save-passwords`; the
table says "Passwords from the shell, not saved" so that a failure in a new terminal is no surprise. The `browser
server` row does not hand them to the launcher either, so they are not written to `.qa/browser-secrets.local.env`.

### Check it again

```shell
npx vc-qa-agents doctor
```

`doctor` checks the same rows again, with the same progress lines, and prints the same table, for example after a change to `.env` or when the platform
was down during `init`. It is not read-only: it runs codegen and the first test, may set `VERIFY_SSL=false` in `.env`
after asking, and its `browser server` row starts the launcher, which rewrites `.qa/browser-secrets.local.env` from
the variables of the run. It exits with 1 when a row fails, so CI can use it, and `--skip-verify` makes it offline. It
needs the agents' check scripts, so run `npx vc-qa-agents` first in a suite that does not have them.

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

Follow the installation steps in the [package README](../README.md#installation), then install the required peer
dependencies and the Node types:

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
