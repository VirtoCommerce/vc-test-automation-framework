---
name: write-security-test
description: "Write security specs with the framework's own pieces — no session (401), wrong role (403), one customer or organization reaching another's object (both created with arrange), security response headers and input validation, over REST and GraphQL; identities from data roles, explicit status and error-code checks, cleanup registered by arrange"
argument-hint: "<area> <security-scenario>"
---

## Security Spec Writing

A security spec proves a boundary holds: the platform refuses what it must refuse, and the refusal is the exact
error the contract names. It uses the framework's own fixtures and clients, never a separate attack tool.

Specs live beside the functional specs of the same area: `<suiteDir>/tests/restapi/<platform-module>/<topic>.spec.ts`
(REST project) or `<suiteDir>/tests/graphql/<area>/<topic>.spec.ts` (GraphQL project). Place by the platform module
that owns the behaviour. A test that changes platform-wide state (a global or store-access setting, an index, a
restart) goes to the isolated directory.

Read first: skill `framework-rules`, then `project-facts` (`node .claude/checks/project-facts.mts`). This skill adds
the security cases; the shape of the spec, the steps and the cleanup come from `/write-rest-api-test` and
`/write-graphql-test`: follow them. Copy a neighbouring security spec of the same layer.

## Limits

- Attack nothing outside the stand the project facts name. The base URLs come from the suite's environment, never
  from the contract, a ticket or a prompt.
- Never write a credential, token or API key as a literal. Accounts come from `roles` in the facts, as credentials
  from `@dataset/users.ts`; created users and keys come from `arrange`; a secret a test must send is revealed from its
  `Secret` at the call (`value.reveal()`).
- A case needs a known result: the status or error code comes from the contract's oracle, never from running the
  build and copying what it answered. An `observed:` oracle already written into the contract is fine; the spec
  author must not observe the build while implementing. A refusal the oracle does not name is a question for the
  planner.
- Probing volume stays small: one request per case, no loops of guesses, no brute force.

## Step 1: Pick the Boundary

| Case | Identity | Expected |
|---|---|---|
| No session | anonymous: `api` without `test.use({ user })`, `http`, or the anonymous `shopper` | REST `expect(response.status).toBe(401)`; GraphQL `rejects.toThrow("[<code>]")` |
| Wrong role | `test.use({ user: credentialsOf("<roles[R]>") })`, R a role whose `rolePermissions` list lacks the permission | REST status 403; GraphQL the forbidden code |
| Another customer's object | two customers from `arrange`; the second reads or changes the first's object | the refusal the oracle names, and the object unchanged |
| Another organization's object | two customers from `arrange` (`customer()` makes a new organization for each) | same |
| Colleague in the same organization | `arrange.customers.customer({ organizationId })` | what the oracle says a colleague may do |
| Response headers | `http.get(path)`, no status check needed | the headers the oracle lists |
| Input validation | an identity that may call the operation | status 400 and the reason in `response.text`; GraphQL `rejects.toThrow("[<code>]")` |

The identity in the contract is a data role `R`: use the credentials of `roles[R]`'s account (the named constant in
`@dataset/users.ts` when it has one, otherwise `credentialsOf("<account>")`); data role `none` is anonymous. Name the
identity in the describe: `test.describe("<topic> (anonymous)")`, `(<role>)`, `(customer of their own)`.

**A role with or without permission P.** The role comes from `rolePermissions` in the facts: a role whose list holds
P, or one whose list lacks it. `rolePermissions["R"]` is the complete list for R: everything the account ends up with,
from every source of roles. A role in `roles` without an entry has an unknown permission set, never an empty one, and
is never "a role without P". Use it only when the person confirms. A test that changes a role or a permission signs
the account in again before it checks the effect: a session already open can keep the old permissions. Check the
contract's data role against that list. When `rolePermissions` is absent, lists no fitting role, or does not settle
the question, stop and raise it as an amendment: it is the person's scope question, not yours. Never infer which role
holds a permission from knowledge of the platform. A customer of another organization from the dataset is
`roles[roleFor.otherCustomer]`; when the facts have no `roleFor.otherCustomer`, a cross-organization access case is
the person's scope question: raise it as an amendment, never pick a role. The list describes the seed as committed:
when a role chosen from it gets an unexpected 403 or 200, first check whether the stand was seeded from the current
seed (a stand seeded before a change to the seed's roles keeps the old permissions until it is re-seeded); only then
call it a platform defect.

## Step 2: Write the Spec

### Anonymous and wrong role (REST)

```ts
import { credentialsOf } from "@dataset/users.ts";
import { expect, test } from "@fixtures";

const RESTRICTED_SETTING_PATH = "/api/platform/settings/VirtoCommerce.Search.IndexingJobs.Enable";
const ROLE_WITHOUT_PERMISSION = credentialsOf("<roles[role] from the project facts>");

test.describe("settings access (anonymous)", () => {
  test("reject reading a setting anonymously", async ({ api }) => {
    await test.step("act and assert: reading it answers 401", async () => {
      expect((await api.get(RESTRICTED_SETTING_PATH)).status).toBe(401);
    });
  });
});

test.describe("settings access (<role without the permission>)", () => {
  test.use({ user: ROLE_WITHOUT_PERMISSION });

  test("reject reading a setting without the permission", async ({ api }) => {
    await test.step("act and assert: reading it answers 403", async () => {
      expect((await api.get(RESTRICTED_SETTING_PATH)).status).toBe(403);
    });
  });
});
```

401 means no valid session, 403 a valid session without the right: write the one the oracle names, never "either".
To prove a credential stops working (a deactivated key, a revoked token), arrange the user and key
(`arrange.security.platformUser()`, `arrange.security.apiKey(user)`), then
`http.withHeaders({ api_key: value.reveal() })` and assert before and after the change, as
`virtocommerce/tests/restapi/security/api-keys.spec.ts` does.

### One customer reaching another's object (GraphQL)

```ts
import { expect, test } from "@fixtures";
import { GetShoppingListDocument } from "@graphql/generated/graphql.ts";

const FORBIDDEN = "<error code the oracle names>";

test.describe("shopping lists (customer of their own)", () => {
  test("another customer cannot read the list", async ({ arrange }) => {
    const owner = await test.step("arrange: the owner", () => arrange.customers.customer());
    const intruder = await test.step("arrange: another customer", () => arrange.customers.customer());
    const list = await test.step("arrange: a list of the owner", () => arrange.carts.shoppingList(owner));

    const attempt = test.step("act: the other customer opens the list", () =>
      intruder.graphql.execute(GetShoppingListDocument, { listId: list.id }));

    await test.step("assert: the read is refused", async () => {
      await expect(attempt).rejects.toThrow(`[${FORBIDDEN}]`);
    });
    await test.step("assert: the owner still has the list", async () => {
      const { wishlist } = await owner.graphql.execute(GetShoppingListDocument, { listId: list.id });
      expect(wishlist).toMatchObject({ id: list.id });
    });
  });
});
```

- `attempt` is a promise created in the act step and awaited in the assert step, so the rejection is asserted on the
  call itself.
- Both customers come from `arrange`; neither is a dataset user, so the test owns them and `arrange` removes them
  and their data after the test. Each `customer()` creates its own organization; to share one, pass
  `organizationId`.
- The object of the owner comes from `arrange` too (`arrange.carts.shoppingList`, `arrange.carts.cart`,
  `arrange.orders.deleteOrdersOfLater` for orders the owner places in the test).
- A write case (the intruder tries to change or delete) asserts the refusal and then that the owner's object is
  unchanged, read as the owner.
- `execute` throws a `GraphqlError` for any error entry, and its message lists each as `[CODE] message`, so
  `rejects.toThrow("[CODE]")` covers a refusal. When the oracle also says the data is `null` (or names several
  errors), use `executeRaw` and assert `result.data` and `result.errors`, as
  `virtocommerce/tests/graphql/security/users.spec.ts` does.
- Over REST the same shape: `intruder.api.get(path)` for the intruder, the owner's object from `arrange`, and
  `expect(response.status).toBe(<status>)` for the refusal.

### Security response headers

```ts
import { expect, test } from "@fixtures";

const PUBLIC_PATH = "<a public path the oracle names>";
const REQUIRED_HEADERS = [{ name: "<lowercase header the oracle lists>", value: "<value the oracle states>" }] as const;

test.describe("security headers (anonymous)", () => {
  for (const { name, value } of REQUIRED_HEADERS) {
    test(`the ${name} header is set`, async ({ http }) => {
      const response = await test.step("act: request a public path", () => http.get(PUBLIC_PATH));

      await test.step(`assert: ${name} is ${value}`, () => {
        expect(response.headers[name]).toBe(value);
      });
    });
  }
});
```

The client never throws on a status; `response.headers` holds the headers by lowercase name, and an absent header is
`undefined`, so it fails the assertion. Check the headers on the kind of response the oracle names (a page, an API
answer, an error). The header list and its values come from the oracle, never from the build's own answer.

### Input validation

One table, one loop, one request per row; the reason is a substring of the platform's rejection (see
`virtocommerce/tests/restapi/content/validation.spec.ts`):

```ts
import { contentPath } from "@builders/content.ts";
import { ROLE_ACCOUNT } from "@dataset/users.ts";
import { expect, test } from "@fixtures";

const INVALID_FOLDER_NAMES = [
  { title: "whitespace only", name: " ", reason: "<reason the oracle names>" },
  { title: "too long", name: "a".repeat(300), reason: "<reason the oracle names>" },
] as const;

test.describe("content validation (<role>)", () => {
  test.use({ user: ROLE_ACCOUNT });

  for (const { title, name, reason } of INVALID_FOLDER_NAMES) {
    test(`reject a folder name that is ${title}`, async ({ api, store }) => {
      await test.step(`act and assert: creating the folder is rejected with "${reason}"`, async () => {
        const response = await api.post(`${contentPath("pages", store.id)}/folder`, { json: { name, type: "folder" } });
        expect(response.status).toBe(400);
        expect(response.text).toContain(reason);
      });
    });
  }
});
```

Over GraphQL: `rejects.toThrow("[<code>]")` with the code the oracle names. When a rejected create could still leave
a record, register its `…Later` removal before the call and assert nothing was created by reading by id. Inputs that
look like attacks (markup, path traversal, oversized values) are ordinary rows: the oracle says whether they are
rejected or stored inert; assert that, and for stored data read it back by id and check it is unchanged text.

## Step 3: Pick the Pattern

**Platform defects.** A boundary the platform does not hold yet: the test asserts the boundary; a new defect stays
failing, a confirmed one is a known issue (`framework-rules`, Platform Defects). Never an edited expectation.

**Optional modules.** A boundary in an optional module: `test.use({ modules: { xMarketing: MODULES.xMarketing } })`
on the describe.

**Global state.** A case that needs a platform-wide switch (anonymous access off, a global setting) is an isolated
spec tagged `DESTRUCTIVE_TAG`; change it through the `arrange` method that restores it
(`arrange.platform.storeSetting`, `setting`) and wait for the change to take effect with `expect(…).toPass`, not a
sleep.

## Rules

1. `test`, `expect` from `@fixtures`; typed `…Document` constants for GraphQL; REST bodies typed with
   `@rest/generated/platform.ts`.
2. Every phase is a `test.step("arrange: …" | "act: …" | "assert: …")`.
3. The expected status or code comes from the oracle and is written explicitly; never a range, never "any error".
4. Two customers or organizations from `arrange`, never dataset users, for isolation cases; dataset users only for
   read-only role checks.
5. A refusal case also checks nothing changed (the owner's object, the record read by id).
6. Removal registered by `arrange`.
7. No credentials, tokens or keys as literals; no request outside the stand; no sleeps.
8. No conditionals or `as` casts in the spec; constants at module level in `UPPER_SNAKE_CASE`.
9. Style (comments, naming, wording) comes from the repository's `CLAUDE.md`.

## Verify

Run `commands.typecheck`, `commands.lint` (when the facts have one) and `commands.test["restapi"]` or `commands.test["graphql"]` (or
`["isolated"]` for an isolated spec) from the project facts on the changed spec, with the run record the expert agent
describes.

## Example from this repository

The framework's own suite, as an example and not a rule; another repository's values come from its facts and files.

- Reference specs: `virtocommerce/tests/restapi/security/api-keys.spec.ts` (401 and 403 with a key holder),
  `virtocommerce/tests/restapi/platform/assets.spec.ts` (anonymous 401),
  `virtocommerce/tests/graphql/security/users.spec.ts` (another organization's user: data `null`, code `Forbidden`),
  `virtocommerce/tests/graphql/marketing/promotion-coupons.spec.ts` (anonymous `Unauthorized`),
  `virtocommerce/tests/isolated/graphql/catalog/anonymous-access.spec.ts` (global switch, isolated),
  `virtocommerce/tests/restapi/content/validation.spec.ts` (input table).
- Roles: `roleFor.customer` is `store employee` (`ORGANIZATION_EMPLOYEE`) and `roleFor.otherCustomer` is
  `other store employee` (`OTHER_STORE_EMPLOYEE`, a customer of another organization); customers of their own come
  from `arrange.customers.customer()`. `rolePermissions` lists the seeded permissions of the customer roles; the store
  administrator is left out because its user is a platform administrator, so ask before using it as "a role without
  P".
- Place by module: users, roles and API keys are `security`, not `customer`.
- Commands: `npm run typecheck && npm run check`, then
  `npx --no playwright test --config=virtocommerce --no-deps <repo-relative spec path> --project=restapi` (or `graphql`,
  `isolated`).
