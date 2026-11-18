# Contract: PRJ-42 coupon on the cart

## Source

ticket: PRJ-42

## Scope

- A shopper applies a coupon code to the cart and the cart total drops by the coupon value.
- An expired coupon is rejected with a named error.

## Out of scope

- Coupon creation in the platform admin: covered by an existing spec.
- Stacking several coupons: the ticket defers it to PRJ-57.

## Cases

| Case | Technique | Project | Data role | Oracle |
|---|---|---|---|---|
| C-01 valid coupon lowers the total | equivalence partitioning | graphql | none | ticket: AC-1 the total drops by the coupon value |
| C-02 expired coupon is rejected | equivalence partitioning | graphql | none | ticket: AC-2 an expired coupon is refused; schema: error code COUPON_EXPIRED |
| C-03 coupon of exactly the minimum cart value | boundary value analysis | graphql | none | doc: the coupon page, minimum order value |
| C-04 empty code | negative | graphql | none | schema: the code argument is required |
| C-05 coupon shown in the cart page | regression | e2e-frontend | store employee | observed: the cart page lists the applied code |

## Observed only

- C-05 coupon shown in the cart page: characterization

## Stand needs

- Profile: default stand profile.
- Modules: marketing.
- Data roles: store employee.

## Building blocks

- Reuse: the cart operations, the coupon arrange method.
- Add: a document for the remove-coupon mutation.

## Known issues

- None.

## Verification

- npm run typecheck
- npm run check
- npx playwright test --list
- npm run test:graphql -- tests/graphql/cart/coupons.spec.ts
