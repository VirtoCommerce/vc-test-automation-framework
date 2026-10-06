---
name: write-rest-api-test
description: "Write REST API specs following project patterns — seeded or admin users, REST clients, builders and arrange helpers, cleanupStack, arrange/act/assert steps, Allure features"
argument-hint: "<area> <test-scenario>"
---

## REST API Spec Writing

Specs live in `tests/restapi/<area>/<feature>.spec.ts` and run in the `restapi` project. Follow these patterns exactly.

## Imports

```ts
import * as allure from "allure-js-commons";

import { PromotionsClient } from "@api/rest/clients/promotions-client";   // area client
import { newCoupon, newPromotion } from "@dataset/builders/marketing";     // drafts
import { SEEDED_USERS } from "@dataset/seeded";                            // seeded constants
import { asWorkerAdministrator, expect, test } from "@fixtures";           // never from @playwright/test
```

## File Skeleton

```ts
test.beforeEach(async () => {
  await allure.feature("Marketing / Promotions");
});

test.describe("promotions (admin)", () => {
  test.use({ user: asWorkerAdministrator });

  test("…", async ({ httpClient, cleanupStack }) => {
    // arrange / act / assert steps
  });
});
```

- `allure.feature("<Area> / <Topic>")`, one per file
- `test.describe("<topic> (<who>)")`: `(admin)` for the worker's administrator (`asWorkerAdministrator`), `(platform admin)` when using `platformAdminHttpClient`, `(anonymous)` for unauthenticated calls
- Clients are created per test from the fixture client: `new PromotionsClient(httpClient)`

## Pattern 1: Create, then Assert

```ts
test("create a promotion", async ({ httpClient, cleanupStack }) => {
  const promotionsClient = new PromotionsClient(httpClient);
  const draft = newPromotion();

  const promotion = await test.step("act: create promotion", () => promotionsClient.create(draft));
  cleanupStack.push(`delete promotion ${promotion.id}`, () => promotionsClient.delete(promotion.id));

  await test.step("assert: promotion is inactive", async () => {
    expect(promotion).toMatchObject({ name: draft.name, isActive: false });
  });
});
```

## Pattern 2: Arrange, Act on It, Assert

```ts
test("get a promotion by id", async ({ httpClient, cleanupStack }) => {
  const promotionsClient = new PromotionsClient(httpClient);
  const promotion = await test.step("arrange: promotion", () => promotionsClient.create(newPromotion()));
  cleanupStack.push(`delete promotion ${promotion.id}`, () => promotionsClient.delete(promotion.id));

  const reloaded = await test.step("act: get promotion", () => promotionsClient.get(promotion.id));

  await test.step("assert: fields match the created promotion", async () => {
    expect(reloaded).toMatchObject({ id: promotion.id, name: promotion.name });
  });
});
```

When the builder sets the id (contacts, organizations, members, orders, pickup locations, menus), register the cleanup **before** the create, so a failing create or check cannot leak the entity:

```ts
const draft = newContact();
cleanupStack.push(`delete contact ${draft.id}`, () => customersClient.contacts.delete([draft.id]));
const contact = await test.step("arrange: contact", () => customersClient.contacts.create(draft));
```

Shared setup with its own cleanup comes from `dataset/arrange`: `arrangeUser`, `arrangeRole`, `arrangeApiKey`, `arrangeOrder`, `arrangeOrganization`, `arrangePage`, `arrangePickupLocation`, `createCategoryWithProduct`.

## Pattern 3: Negative Cases

```ts
test("get a missing contact", async ({ httpClient }) => {
  const { contacts } = new CustomersClient(httpClient);

  const contact = await test.step("act: get contact by a missing id", () => contacts.find(crypto.randomUUID()));

  await test.step("assert: contact is not found", async () => {
    expect(contact).toBeUndefined();
  });
});
```

- Missing entity: `find…()` returns `undefined`; `get…()` throws
- Status codes: `await expect(client.call(...)).rejects.toMatchObject({ status: 400 })`
- Security results: `expect(result).toMatchObject({ succeeded: false, errors: ["Incorrect password."] })`

## Pattern 4: Global Settings

Settings are shared by every test running at the same time, in every file. Undo only your own change:

```ts
// a value the test needs in a list setting (added only if missing, removed only by this test)
await test.step(`arrange: ${FORBIDDEN_EXTENSION} is blacklisted`, () =>
  arrangeSettingValue(settingsClient, cleanupStack, FILE_EXTENSIONS_BLACKLIST_SETTING, FORBIDDEN_EXTENSION));

// adding to a list setting is the action under test
registerSettingValuesRemoval(settingsClient, cleanupStack, MEMBER_GROUPS_SETTING, [tag]);
await test.step("act: add tag", () => addSettingValue(settingsClient, MEMBER_GROUPS_SETTING, tag));

// a single value: only for settings no other file reads, in a mode: "default" describe
const original = await test.step("arrange: current value", () =>
  registerSettingRestore(settingsClient, cleanupStack, BOOLEAN_SETTING));
await test.step("act: toggle", () => settingsClient.save([{ ...original, value: !(original.value ?? original.defaultValue) }]));
```

Never toggle settings that change platform behaviour other tests rely on (indexing jobs, security, store access) outside `@destructive` tests.

## Pattern 5: Repeated Cases

```ts
for (const objectType of OBJECT_TYPES) {
  test(`create a dynamic property for ${objectType}`, async ({ httpClient, cleanupStack }) => { … });
}
```

## Assertions

```ts
expect(entity).toMatchObject({ name: draft.name });          // fields the test controls
expect(found.map(({ id }) => id)).toContain(entity.id);      // own data in a search result
expect(results).not.toContainEqual(expect.objectContaining({ id: deleted.id }));
await expect.poll(() => client.search({ keyword }), { timeout: INDEX_TIMEOUT_MS })   // index-backed searches
  .toContainEqual(expect.objectContaining({ id: entity.id }));
```

Never assert `toEqual([...])` on a whole search result: other tests create data in parallel.

## Rules

1. `test`, `expect`, `seededUser` from `@fixtures`; seeded ids and usernames from `dataset/seeded.ts`
2. `allure.feature` in `beforeEach`; `describe` per role; `arrange:` / `act:` / `assert:` steps
3. Calls through `api/rest/clients/*` (add methods with `/create-rest-client`); raw `httpClient` only to assert a status the client hides
4. Every created entity has a `cleanupStack.push`, before the create when the id is known
5. Unique names from builders (`uniqueId`); no hard-coded names that parallel runs could share
6. `test.describe.configure({ mode: "default" })` for files that change global state; `arrangeSettingValue` / `registerSettingValuesRemoval` for list settings, `registerSettingRestore` for single values
7. `{ tag: "@destructive" }` for anything that restarts or reloads the platform
8. `test.fail(true, "<reason>")` for known product issues, with the tracker key in the reason when there is one
9. No fallbacks (`?? ""`, `?? []`, `?? 0`): use `requireFields` so missing data fails clearly
