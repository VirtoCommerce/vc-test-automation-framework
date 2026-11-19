---
name: write-security-test
description: "Write security specs with the framework's own pieces — no session (401), wrong role (403), one customer or organization reaching another's object (both created with arrange), security response headers and input validation, over REST and GraphQL; identities from data roles, errors with toBeHttpError / toBeGraphqlError, cleanup registered by arrange"
argument-hint: "<area> <security-scenario>"
---

## Security Spec Writing

A security spec proves a boundary holds: the platform refuses what it must refuse, and the refusal is the exact
error the contract names. It uses the framework's own fixtures and matchers, never a separate attack tool.

Specs live beside the functional specs of the same area: `tests/restapi/<platform-module>/<topic>.spec.ts` (REST
project) or `tests/graphql/<area>/<topic>.spec.ts` (GraphQL project). Place by the platform module that owns the
behaviour. A test that changes platform-wide state (a global or store-access setting, an index, a restart) goes to
the isolated project (`tests/isolated/`).

Read first: skill `framework-rules`, then `project-facts` (`node .claude/checks/project-facts.mts`), then the repository's README
for its REST and GraphQL test shapes. This skill adds the security cases; the shape of the spec, the steps, the
metadata and the cleanup come from `/write-rest-api-test` and `/write-graphql-test`: follow them. Copy a neighbouring
security spec of the same layer.

## Limits

- Attack nothing outside the stand the project facts name. The base URLs come from the framework's environment, never
  from the contract, a ticket or a prompt.
- Never write a credential, token or API key as a literal. Accounts come from `roles` in the facts; created users and
  keys come from `arrange`; a secret a test must send is revealed from its `Secret` at the call (`value.reveal()`).
- A case needs a known result: the status or error code comes from the contract's oracle, never from running the
  build and copying what it answered. An `observed:` oracle already written into the contract is fine; the spec
  author must not observe the build while implementing. A refusal the oracle does not name is a question for the planner.
- Probing volume stays small: one request per case, no loops of guesses, no brute force.

## Step 1: Pick the Boundary

| Case | Identity | Expected |
|---|---|---|
| No session | anonymous: `api` without `test.use`, or `api.anonymous()` | REST `toBeHttpError(401)`; GraphQL `toBeGraphqlError("<code>")` |
| Wrong role | `test.use({ user: <roles[R]> })`, R a role whose `rolePermissions` list lacks the permission | REST `toBeHttpError(403)`; GraphQL the forbidden code |
| Another customer's object | two customers from `arrange`; the second reads or changes the first's object | the refusal the oracle names, and the object unchanged |
| Another organization's object | two organizations from `arrange` (`customerAccount()` makes one each) | same |
| Colleague in the same organization | `customerAccount({ organizationId })` | what the oracle says a colleague may do |
| Response headers | `api.http.get(path)`, no status check needed | the headers the oracle lists |
| Input validation | an identity that may call the operation | `toBeHttpError(400, "<reason>")` / `toBeGraphqlError("VALIDATION_ERROR")` |

The identity in the contract is a data role `R`: write `roles[R]`'s account as a string; data role `none` is
anonymous. Name the identity in the describe: `test.describe("<topic> (anonymous)")`, `(<role>)`,
`(customer of their own)`.

**A role with or without permission P.** The role comes from `rolePermissions` in the facts: a role whose list holds
P, or one whose list lacks it. `rolePermissions["R"]` is the complete list for R: everything the account ends up with,
from every source of roles. A role in `roles` without an entry has an unknown permission set, never an empty one, and
is never "a role without P". Use it only when the person confirms. A test that changes a role or a permission signs
the account in again before it checks the effect: a session already open can keep the old permissions. Check the contract's data role against that list. When `rolePermissions` is absent,
lists no fitting role, or does not settle the question, stop and raise it as an amendment: it is the person's scope
question, not yours. Never infer which role holds a permission from knowledge of the platform. A customer of another
organization from the dataset is `roles[roleFor.otherCustomer]`; when the facts have no `roleFor.otherCustomer`, a
cross-organization access case is the person's scope question: raise it as an amendment, never pick a role. The list describes the seed as committed: when a role
chosen from it gets an unexpected 403 or 200, first check whether the stand was seeded from the current seed (a stand
seeded before a change to the seed's roles keeps the old permissions until it is re-seeded); only then call it a
product defect.

## Step 2: Write the Spec

### Anonymous and wrong role (REST)

```ts
import * as allure from "allure-js-commons";

import { expect, test } from "@fixtures";

const RESTRICTED_SETTING = "<name of a setting only an administrator reads>";

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Security / Access");
});

test.describe("settings access (anonymous)", () => {
  test("reject reading a setting anonymously", async ({ api }) => {
    await allure.story("No session");
    await allure.description("A setting is not read by a visitor without a session.");

    await test.step("assert: reading it answers 401", async () => {
      await expect(api.rest.settings.get(RESTRICTED_SETTING)).rejects.toBeHttpError(401);
    });
  });
});

test.describe("settings access (<role without the permission>)", () => {
  test.use({ user: "<roles[role] from the project facts>" });

  test("reject reading a setting without the permission", async ({ api }) => {
    await allure.story("Wrong role");
    await allure.description("A signed-in user without the permission is refused, not treated as anonymous.");

    await test.step("assert: reading it answers 403", async () => {
      await expect(api.rest.settings.get(RESTRICTED_SETTING)).rejects.toBeHttpError(403);
    });
  });
});
```

401 means no valid session, 403 a valid session without the right: write the one the oracle names, never "either".
To prove a credential stops working (a deactivated key, a revoked token), arrange the user and key
(`arrange.security.platformUser()`, `arrange.security.apiKey(user)`), then
`api.anonymous().withHeaders({ <header>: value.reveal() })` and assert before and after the change.

### One customer reaching another's object (GraphQL)

```ts
import * as allure from "allure-js-commons";

import { GetShoppingListDocument } from "@api/graphql/generated/graphql";
import { expect, test } from "@fixtures";

const FORBIDDEN = "<error code the oracle names>";

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Security / Isolation");
});

test.describe("shopping lists (customer of their own)", () => {
  test("another customer cannot read the list", async ({ arrange }) => {
    await allure.story("Isolation");
    await allure.description("A customer asking for another customer's list by id is refused.");
    const owner = await test.step("arrange: the owner", () => arrange.customers.customerAccount());
    const intruder = await test.step("arrange: another customer", () => arrange.customers.customerAccount());
    const list = await test.step("arrange: a list of the owner", () => arrange.carts.shoppingList(owner.api));

    const attempt = test.step("act: the other customer opens the list", () =>
      intruder.api.graphql.execute(GetShoppingListDocument, { listId: list.id }));

    await test.step("assert: the read is refused", async () => {
      await expect(attempt).rejects.toBeGraphqlError(FORBIDDEN);
    });
    await test.step("assert: the owner still has the list", async () => {
      const { wishlist } = await owner.api.graphql.execute(GetShoppingListDocument, { listId: list.id });
      expect(wishlist).toMatchObject({ id: list.id });
    });
  });
});
```

- `attempt` is a promise created in the act step and awaited in the assert step, as `promotion-coupons.spec.ts`
  does, so the rejection is asserted on the call itself.
- Both customers come from `arrange`; neither is a dataset user, so the test owns them and `arrange` removes them
  and their data after the test. For organizations, each `customerAccount()` creates its own organization; to share
  one, pass `organizationId`.
- The object of the owner comes from `arrange` too (`arrange.carts.shoppingList`, `arrange.carts.cart`,
  `arrange.orders.deleteOrderLater` for an order the owner placed through the cart checkout). Register cleanup before
  the change.
- A write case (the intruder tries to change or delete) asserts the refusal and then that the owner's object is
  unchanged, read as the owner.
- `execute` throws `GraphqlError` for any error entry, so `rejects.toBeGraphqlError` covers a refusal. When the
  oracle also says the data is `null` (or names several errors), use `executeRaw` and assert `result.data` and
  `result.errors`.
- Over REST the same shape: `customer.api.rest.<module>.<resource>.get(id)` for the intruder, the owner's object from
  `arrange`, `rejects.toBeHttpError(<status>)` for the refusal.

### Security response headers

```ts
const PUBLIC_PATH = "<a public path an existing client already reads>";
const REQUIRED_HEADERS = [
  { name: "<header the oracle lists>", value: "<value the oracle states>" },
] as const;

for (const { name, value } of REQUIRED_HEADERS) {
  test(`the ${name} header is set`, async ({ api }) => {
    await allure.story("Headers");
    await allure.description(`Responses carry ${name}: ${value}.`);

    const response = await test.step("act: request a public path", () => api.http.get(PUBLIC_PATH));

    await test.step(`assert: ${name} is ${value}`, () => {
      expect(response.header(name)).toBe(value);
    });
  });
}
```

`api.http` never throws on a status; `response.header(name)` reads a header in any letter case and returns
`undefined` when it is absent, so an absent header fails the assertion. Check the headers on the kind of response the
oracle names (a page, an API answer, an error). The header list and its values come from the oracle, never from the
build's own answer.

### Input validation

One table, one loop, one request per row; the reason is a substring of the platform's rejection:

```ts
const INVALID_INPUTS = [
  { title: "an empty name", input: "", reason: "<reason the oracle names>" },
  { title: "a name over the limit", input: "a".repeat(<limit + 1>), reason: "<reason the oracle names>" },
] as const;

for (const { title, input, reason } of INVALID_INPUTS) {
  test(`reject ${title}`, async ({ api }) => {
    await allure.story("Validation");
    await allure.description(`${title} is refused with a 400, and nothing is created.`);

    await test.step("assert: the request is rejected", async () => {
      await expect(api.rest.<module>.<resource>.create(input)).rejects.toBeHttpError(400, reason);
    });
  });
}
```

Over GraphQL: `rejects.toBeGraphqlError("VALIDATION_ERROR")`. When a rejected create could still leave a record, push the
undo on `cleanup` before the call and assert nothing was created by reading by id. Inputs that look like attacks
(markup, path traversal, oversized values) are ordinary rows: the oracle says whether they are rejected or stored
inert; assert that, and for stored data read it back by id and check it is unchanged text.

## Step 3: Pick the Pattern

**Known defects.** A boundary the platform does not hold yet: `await knownIssue(KNOWN_ISSUES.x)` first in the test,
with the entry in `known-issues.json`. Never an edited expectation.

**Optional modules.** A boundary in an optional module: `test.use({ requiresModules: [MODULES.x] })` on the describe.

**Global state.** A case that needs a platform-wide switch (anonymous access off, a global setting) is an isolated
spec; change it through the `arrange` method that restores it (`arrange.platform.storeSetting`, `setting`) and wait
for the change to take effect with a poll, not a sleep.

## Rules

1. `test`, `expect`, `knownIssue` from `@fixtures`; typed `…Document` constants and the REST clients; `api.http` only for response headers.
2. Every phase is a `test.step("arrange: …" | "act: …" | "assert: …")`.
3. The expected status or code comes from the oracle and is written explicitly; never a range, never "any error".
4. Two customers or organizations from `arrange`, never dataset users, for isolation cases; dataset users only for
   read-only role checks.
5. A refusal case also checks nothing changed (the owner's object, the record count by id).
6. Cleanup registered before the change; `arrange` does it.
7. No credentials, tokens or keys as literals; no request outside the stand; no sleeps.
8. No conditionals, `as` casts or helper functions in the spec; constants at module level in `UPPER_SNAKE_CASE`.
9. Style (comments, naming, wording) comes from the repository's `CLAUDE.md`.

## Verify

Run `commands.typecheck`, `commands.lint` and `commands.test["restapi"]` or `commands.test["graphql"]` (or
`["isolated"]` for an isolated spec) from the project facts on the changed spec, with the run record the expert agent
describes.

## Example from this repository

- Reference specs: `tests/restapi/security/api-keys.spec.ts` (401 and 403 with a key holder),
  `tests/restapi/platform/assets.spec.ts` (anonymous 401), `tests/graphql/security/users.spec.ts` (another
  organization's user: data `null`, code `Forbidden`), `tests/graphql/marketing/promotion-coupons.spec.ts` (anonymous
  `Unauthorized`), `tests/isolated/graphql/catalog/anonymous-access.spec.ts` (global switch, isolated),
  `tests/restapi/content/validation.spec.ts` (input table).
- Roles: `roleFor.customer` is `store employee` and `roleFor.otherCustomer` is `other store employee` (a customer of
  another organization); customers of their own come from `arrange.customers.customerAccount()`. `rolePermissions`
  lists the store employee's, manager's and purchasing agent's seeded permissions; the store administrator is left
  out because its user is a platform administrator, so ask before using it as "a role without P".
- Place by module: users, roles and API keys are `security`, not `customer`.
- Commands: `npm run typecheck && npm run check`, then
  `npm run test:restapi -- tests/restapi/<platform-module>/<topic>.spec.ts` or
  `npm run test:graphql -- tests/graphql/<area>/<topic>.spec.ts`.
