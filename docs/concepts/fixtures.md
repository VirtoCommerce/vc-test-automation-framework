# Fixtures

`defaultFixtures` returns the Playwright fixtures that tests of a Virto Commerce solution need, for its platform and its
frontends: clients of the platform, signed-in users, the installed modules and browser sessions. A test suite passes
them to `test.extend` and adds its own fixtures on top.

<!-- example: ../examples/fixtures.ts -->
```ts
import type { Credentials } from "@virtocommerce/test-automation-framework/auth";
import type { DefaultFixtures, DefaultWorkerFixtures } from "@virtocommerce/test-automation-framework/fixtures";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";
import type { ModuleRequirement } from "@virtocommerce/test-automation-framework/modules";

import { test as base, expect } from "@playwright/test";
import { envSchema, originUrl, parseEnv, Secret } from "@virtocommerce/test-automation-framework/core";
import { defaultFixtures } from "@virtocommerce/test-automation-framework/fixtures";

const suiteEnvSchema = envSchema.extend({ FRONTEND_BASE_URL: originUrl });
type SuiteEnv = ReturnType<typeof suiteEnvSchema.parse>;
const env = parseEnv(suiteEnvSchema);

const QUOTES: ModuleRequirement = { id: "VirtoCommerce.Quote", minVersion: "3.1005.0" };

const customer: Credentials = {
  username: "customer@example.com",
  password: Secret.of("Customer-Password-1"),
  storeId: "B2B-store",
};

export const test = base.extend<DefaultFixtures, DefaultWorkerFixtures<SuiteEnv>>(defaultFixtures(env)).extend<{
  customerApi: HttpClient;
}>({
  customerApi: async ({ signIn }, use) => use(await signIn(customer)),
  context: async ({ context, frontendSessions, env }, use) => {
    await context.setStorageState(await frontendSessions.signedIn(env.FRONTEND_BASE_URL, customer));
    await use(context);
  },
});

test.describe("quotes", () => {
  test.use({ modules: { QUOTES } });

  test("a customer sees their quotes", async ({ customerApi, page }) => {
    expect((await customerApi.get("/api/platform/security/currentuser")).ok).toBe(true);

    await page.goto(new URL("/account/quotes", env.FRONTEND_BASE_URL).href);
    await expect(page.getByRole("heading", { name: "Quotes" })).toBeVisible();
  });
});
```

TypeScript cannot infer the fixture types from the definitions, so the test suite passes `DefaultFixtures` and
`DefaultWorkerFixtures` to `extend`. The test suite chooses its base test: Playwright's `test`, or a test that it
combined with others through `mergeTests`.

## Worker fixtures

A worker creates these once and shares them between its tests:

| Fixture            | Is                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `env`              | The environment variables of the test suite                                              |
| `workerHttp`       | A client of the platform without authentication, for the work of the worker              |
| `tokens`           | The `TokenManager` of the worker. It signs users out when the worker ends                |
| `workerAdmin`      | A client signed in as the administrator, for data that the tests of a file share         |
| `frontendSessions` | The `FrontendBrowserSessions` of the worker. Its tokens are revoked when the worker ends |
| `platformSessions` | The `PlatformBrowserSessions` of the worker                                              |

The other fixtures read the platform's address and the administrator from `env`. A test suite that overrides `env`
points them all elsewhere.

## Test fixtures

| Fixture      | Is                                                                     |
| ------------ | ---------------------------------------------------------------------- |
| `apiContext` | The request context of the test, disposed of after it                  |
| `http`       | A client of the platform without authentication                        |
| `signIn`     | Returns a client signed in as a user. The token is kept for the worker |
| `graphql`    | A GraphQL client of the platform without authentication                |
| `modules`    | The modules that the tests need, an option set with `test.use`         |

Users sign in once for each worker. Each test has its own request context, so cookies of one test never reach another.

## Required modules

A test whose `modules` are not installed, or not in their range of versions, is skipped, and the reason names each
module. A version that cannot be compared fails the test. The modules are read, as the administrator, only for a test
that names requirements, so a worker whose tests need none never signs the administrator in to check them.

`modules` is a record of `ModuleRequirement`s, so a test names the test suite's constants with shorthand properties,
such as `{ QUOTES, XPICKUP }`. The keys are only labels; the reason names the modules. These are the same
constants that the dataset manifest uses, so a collection that the seed skips and the tests that use its data skip for
the same reason.

An inner `test.use` replaces the requirements of the outer one. To keep them, spread them: `{ ...OUTER, QUOTES }`.

## Browser sessions

Browser tests start signed in, so they skip the sign-in pages. The test suite overrides `context` and applies a storage
state of `frontendSessions` or `platformSessions`, as the example does. See
[Authentication](auth.md#browser-sessions) for how the sessions sign in and when they sign out.

A user that a test deletes must be signed out first: call `tokens.signOut`, `frontendSessions.signOut` and
`platformSessions.forget`. Otherwise the worker fails to revoke a token of the deleted user when it ends.

## Traces

Every request appears in the trace of the test that runs at the time. Requests of the worker, such as sign-ins and
reading the modules, appear in the trace of the test that first needs them.
