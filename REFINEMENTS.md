# Refinements

Architecture and design refinements for this project, ordered by value for the effort. Each item says what is
wrong today, what to change, and roughly how big the change is. When an item is done, remove it from this file.

## 1. Make "the seed is repeatable" a manifest rule

**Problem.** `npm run seed` is meant to be safe to repeat, but collections that create a duplicate on a second
run were found one by one: coupons and orders (fixed), shipping methods (open: a duplicate key on
`IX_StoreShippingMethodEntity_TypeName_StoreId`), and probably payment methods.

**Change.** Every collection in `dataset/manifest.ts` declares how a repeat avoids duplicates:

```ts
/** How a second seed avoids duplicates: look the record up and skip it, or rely on the endpoint replacing it. */
readonly repeat: "find" | "upsert";
```

A unit test requires a `find` path wherever `repeat` is `"find"`, so no collection can be added without
deciding. Shipping and payment methods get fixed with it. The platform creates them per store, so their lookup
is by store and code, not by an id the dataset chooses.

**Size.** The manifest field and test; the fix for shipping and payment methods.

## 2. Less boilerplate in the REST clients

**Problem.** The REST client layer repeats the same plumbing in every client:

| Pattern | Count |
|---|---|
| `requireFields` / `optionalFields` / `requireFieldsOfEach` calls in clients, each with a fields constant and a label | 176 |
| `*_FIELDS` constants plus a matching `WithRequired<…>` type | 46 + 46 |
| type files that import generated names and then re-export them in a second list | 22 |

**Change.**
- **Record shapes.** One object per model holds its required fields and its label, and `HttpResponse` applies
  it:
  ```ts
  export const PRICELIST = shape<PricelistData>()("Pricelist", ["id", "name", "currency"]);
  export type Pricelist = Shaped<typeof PRICELIST>;

  async create(pricelist: PricelistData): Promise<Pricelist> {
    return (await this.#httpClient.post(PRICELISTS_PATH, { json: pricelist })).record(PRICELIST);
  }
  async search(query: PricelistQuery): Promise<Pricelist[]> {
    return (await this.#httpClient.get(PRICELISTS_PATH, { query })).results(PRICELIST);
  }
  ```
  Most client methods drop to one line, and errors name the request (`POST /api/pricing/pricelists`) instead of
  a hand-written label.
- **Type files.** A single `export type { VirtoCommerce…Catalog as CatalogData, … } from "../generated/rest-api"`
  instead of an import list plus an export list.

**Size.** About a quarter of `api/rest` goes away, with no change in behaviour. It is mechanical and can be done
one client at a time, with the type check as the safety net. Start with a small client such as pricing.

## 3. One helper for GraphQL waits in page objects

**Problem.** Page objects that wait for an API response each carry their own helper: the cart coupon section
(`pages/frontend/components/coupons.ts`) and the page builder shell (`pages/backend/page-builder/page-builder.ts`).

**Change.** One shared helper under `pages/`:

```ts
/** Runs `action` and waits for the GraphQL response of `operation`, such as `addCoupon`. */
export async function whenGraphql(page: Page, operation: string, action: () => Promise<void>): Promise<void>
```

The coupon section and the page builder shell use it first; cart quantity changes and lists follow as they are
touched.

**Size.** Small.

## 4. Cart totals check as a matcher

**Problem.** "Subtotal − discount + tax + shipping = total" is written out inline in five GraphQL coupon tests.

**Change.** A matcher in `api/api-matchers.ts`, so the rule is in one place and fails with one clear message:

```ts
expect(cart).toHaveConsistentTotals();
```

**Size.** Small: the matcher, its unit test, five call sites.

## 5. Register the undo and create in one call in `arrange`

**Problem.** "Register cleanup before the change" is done by hand about 40 times in `dataset/arrange/`: first
`cleanup.push(…)`, then the create call. Swapping the two lines would compile and leave data behind when the
create fails.

**Change.**

```ts
/** Registers `undo`, then runs `create`; the undo is in place even when `create` fails half-way. */
async track<T>(description: string, undo: () => Promise<void>, create: () => Promise<T>): Promise<T>
```

**Size.** Small; it makes the rule hard to get wrong rather than saving lines.

## 6. Kept in view

- **`pages/` structure.** Split into layouts, pages, components and flows (deferred). `components/` keeps growing;
  coupons added another file.
- **Coupon UI selectors.** The frontend's coupon section has no `data-test-id`s, so its page objects use CSS
  classes, as the page builder ones do. Request `data-test-id`s from the frontend team, as for the page builder.

## 7. Left from the migration of the old suite

Every test of the old suite is ported, merged or dropped except the four below. The migration map (`TESTS.md`) was
removed once only these were left; it stays in the git history.

**Four tests waiting for a tracker key.** Each was recorded as a platform defect before checking that the defect is
real. Two of the six known issues checked in October 2026 turned out to be our own test data or intended behaviour,
so check each one first: a raw request or the UI by hand, the module source at the current version, and whether the
old test's expectation is right. Then port it with `knownIssue` and a tracker key, or as a normal test with the
right expectation, or drop it.

| Old test | What it expected | Suspected defect | Goes to |
|---|---|---|---|
| send a verification email (`platform/user-passwords.spec.ts`) | a `ConfirmationEmailNotification` entry in the notification journal | no entry appears | `tests/restapi/security/`; `UsersClient.sendVerificationEmail` is kept for it |
| reject a store without a name (`store/stores.spec.ts`) | a 4xx | the platform answers 500 | `tests/restapi/store/` |
| publishing a page shows a success toast (`page-builder/page-status.spec.ts`) | a toast on publish | no toast | `tests/e2e/backend/page-builder/page-status.spec.ts` |
| unpublishing a page shows a success toast (`page-builder/page-status.spec.ts`) | a toast on unpublish | no toast | `tests/e2e/backend/page-builder/page-status.spec.ts` |

**An open question for the platform team.** A plain `org-employee` can read the full account (email, roles,
contact id) of any user in the same organization through the GraphQL `user` query; outside the organization the
platform answers `Forbidden`. If that is intended, add a positive "a colleague's account is readable" test; if not,
add a test expecting `Forbidden`, marked as a known issue.

**Known issues already in hand.** 8 REST tests are skipped through `dataset/known-issues.ts`. Each was checked
against the module's source (`dev` branch) and runs against platform 3.1078.0 (Content 3.1006.0,
CatalogPublishing 3.1007.0, PageBuilderModule 3.1034.0) in October 2026, so none is a test mistake:

| # | Behaviour | Owner | Skipped tests | Decision needed |
|---|---|---|---|---|
| 1 | OAuth app search ignores `keyword` and `objectIds` | Platform | 1 | Bug or "not supported"? |
| 2 | Completeness channel search ignores `keyword` and `objectIds` | CatalogPublishing | 1 | Bug or "not supported"? |
| 3 | A second page with an existing permalink is accepted | PageBuilder | 1 | Should permalinks be unique? |
| 4 | Permalinks with spaces or `& ? #` are stored as sent | PageBuilder | 2 | Should permalinks be validated? |
| 5 | Content statistics return `-1` | Content (by design) | 3 | Devops: enable the setting in CI |

For 1 to 4: if the team calls it a bug, add the tracker key to the entry, and the test runs as an expected failure
that reports when the bug is fixed. If it is intended, delete or rewrite the test and drop the entry.

1. **OAuth app search ignores its filters (platform).**
   - `POST /api/platform/oauthapps/search` with `{ "keyword": "<clientId>" }` or `objectIds` returns every OAuth
     app, not the matching one.
   - `OAuthAppSearchCriteria` is an empty subclass of `SearchCriteriaBase`, so `keyword` and `objectIds` are
     accepted and appear in Swagger. `OAuthAppsController.SearchAsync` applies only sorting, `Skip` and `Take`.
     [OAuthAppsController.cs](https://github.com/VirtoCommerce/vc-platform/blob/dev/src/VirtoCommerce.Platform.Web/Controllers/Api/OAuthAppsController.cs)
   - Test: `restapi/security/oauth-apps.spec.ts` › search OAuth apps by client id.
2. **Completeness channel search ignores its filters (CatalogPublishing).**
   - `POST /api/completeness/channels/search` with `{ "objectIds": ["<id>"] }` or `keyword` returns every
     channel.
   - The same pattern: `CompletenessChannelSearchCriteria` adds only `CatalogIds`, and
     `CompletenessServiceImpl.SearchChannelsAsync` filters only by `CatalogIds`.
     [CompletenessServiceImpl.cs](https://github.com/VirtoCommerce/vc-module-catalog-publishing/blob/dev/src/VirtoCommerce.CatalogPublishingModule.Data/Services/CompletenessServiceImpl.cs)
   - Test: `restapi/catalog-publishing/channels.spec.ts` › search channels by id.
3. **Duplicate permalinks are accepted (PageBuilder).**
   - `POST /api/page-builder-pages/create-group-page` twice with the same permalink, store and language
     creates both pages.
   - Nothing checks uniqueness at any layer: `PageBuilderPageController.CreateGroupPage` copies `model.Permalink`
     as sent, `GroupedPageService` has no check, `PageBuilderModuleDbContext` has no unique index on `Permalink`,
     and the admin app's permalink field has only `rules="required"`.
     [PageBuilderPageController.cs](https://github.com/VirtoCommerce/vc-module-pagebuilder/blob/dev/src/VirtoCommerce.PageBuilderModule.Web/Controllers/Api/PageBuilderPageController.cs)
   - Risk: for one permalink the frontend has two candidate pages, so which one it serves is undefined.
   - Test: `restapi/page-builder/pages.spec.ts` › a second page with an existing permalink is rejected.
4. **Permalinks are not validated (PageBuilder).**
   - The same endpoint stores a permalink with spaces, `&`, `?` or `#` exactly as sent.
   - The same code paths as 3: no format rule in the API, the service or the admin app.
   - Risk: the page's URL cannot be reached as written, since `?` and `#` start the query and the fragment.
   - Tests: `restapi/page-builder/pages.spec.ts` › a permalink with spaces / with reserved characters is rejected.
5. **Content statistics return `-1` (by design, needs a setting).**
   - `GET /api/content/{storeId}/stats` answers `-1` for `pagesCount`, `blogsCount` and `themesCount`.
   - Intended: the endpoint counts only when `Content:StatisticEnabled=true`, and the default is `false`.
     [ContentController.cs](https://github.com/VirtoCommerce/vc-module-content/blob/dev/src/VirtoCommerce.ContentModule.Web/Controllers/Api/ContentController.cs),
     [ConfigurationExtensions.cs](https://github.com/VirtoCommerce/vc-module-content/blob/dev/src/VirtoCommerce.ContentModule.Core/Extensions/ConfigurationExtensions.cs)
   - Ask for devops: add `- Content:StatisticEnabled=true` to the `vc-platform-web` environment in
     `VirtoCommerce/.github` → `actions/docker-env-full/docker-compose.yml`, next to
     `Search:PickupLocationFullTextSearchEnabled=true`, and release a new tag. Then bump the tag in our workflow
     and remove `contentStatisticNotCounted` in the same commit. Locally, add the same line to the platform
     service of the compose file.
   - Tests: `restapi/content/files.spec.ts` › count a page / a blog / a theme in the content statistic.

**Resolved: "ship-to label not refreshed" was our test data.** The header kept "Select address" after a saved
address was picked, until a reload. Test customers were named like `Customer-14f6af4e`, and `updateContact`, which
saves the pick, refuses names with digits or dashes, so the pick was never saved. Contacts now get letter-only
names (`uniqueName`) and the known issue is gone. A UX note for the frontend team: when `updateContact` fails, the
frontend shows no error.

## Suggested order

1 first: it prevents a problem we actually hit. Then 2, as a separate mechanical PR. Then 3 to 5 as small
tidy-ups, each in passing when that code is touched next.
