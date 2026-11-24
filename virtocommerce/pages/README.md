# Page objects

The page objects of the Virto Commerce test suite: the frontend (the shop) and the back-office apps of the platform.
Specs and fixtures import them through the `@pages` alias, such as `@pages/frontend/frontend.ts`; files inside this
directory import each other by relative paths.

## Find a page object by its name

- **One class per file, and the file is named after the class** in kebab case: `AccountMenu` is in `account-menu.ts`.
  Biome fails a file with a second class or a name that is not in kebab case.
- **The last word of the name says what it is,** in the class and in the file: `-page`, `-layout`, `-modal`,
  `-section`, `-card`, `-form`, `-menu`, `-selector`, `-blade`, `-popup`, `-flow`.
- **A type lives in the file of the class that uses it,** such as `ShipToAddressFilter` in `ship-to-selector.ts`.
- **There are no `index.ts` files.** An import always shows the file that holds the class.

## Where a page object lives

| Directory                     | Holds                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `frontend/frontend.ts`        | `Frontend`, the factory that the `frontend` fixture gives to specs              |
| `frontend/layouts/`           | The layouts that pages extend, such as `MainLayout`                             |
| `frontend/pages/<area>/`      | One page object for each frontend page, by the area of its route                |
| `frontend/components/<area>/` | Parts that pages are built from, by the area of the frontend where they appear  |
| `frontend/ui-kit/`            | Elements of the frontend's UI kit, such as the quantity control and modals      |
| `frontend/flows/`             | Steps that span several pages, such as `CheckoutFlow`                           |
| `backend/vc-shell/`           | Elements of the vc-shell UI kit that the platform's apps share                  |
| `backend/page-builder/`       | The page builder app                                                            |
| `backend/page-designer/`      | The page designer app                                                           |
| `shared/`                     | Selector builders and waits for responses, used across the frontend and backend |

The component areas follow the frontend: `address`, `cart`, `catalog`, `checkout`, `coupons`, `header` and `lists`.
Every component is in an area directory, never directly in `components/`. Lists, shopping lists and wishlists are one
feature: the frontend calls them lists, so the page objects do, while the platform and its API say wishlists.

## Functions

Most files hold a class. Functions are kept to these places:

- small locator helpers for an element, next to its class or in `ui-kit/`, such as `searchInputIn` in `data-grid.ts`
  and `badgeContent` in `badge.ts`;
- the routes and the request predicates of a backend app, in its `routes.ts` and `requests.ts`;
- `shared/selectors.ts` and `shared/responses.ts`.

## Writing a page object

- A component takes the `Locator` of its root, and a page extends its layout.
- Prefer `data-test-id` attributes through `getByTestId`, then roles. CSS classes of the UI kits, such as `.vc-*`,
  belong in `frontend/ui-kit/` and `backend/vc-shell/` only.
- Name a method after what it does, and say in its documentation comment whether it waits, for example "does not wait
  for the cart to update".
