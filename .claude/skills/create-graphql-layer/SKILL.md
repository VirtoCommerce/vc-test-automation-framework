---
name: create-graphql-layer
description: "Add xAPI GraphQL operations and fragments as .graphql documents, regenerate the typed documents with GraphQL Code Generator, and add arrange methods around them when several specs need the same setup"
argument-hint: "<area> <operation>"
---

## GraphQL Layer

There are no hand-written operation classes or model types. An operation is a `.graphql` document; GraphQL Code
Generator turns it into a typed `…Document` constant plus result and variable types, and the framework's
`GraphqlClient` (`shopper.graphql`, the `graphql` fixture) executes it.

Read first: skill `framework-rules`, then `project-facts` (`node .claude/checks/project-facts.mts`).

## File Locations

- Operations: `virtocommerce/graphql/operations/<area>/<operation-name>.graphql` (kebab-case, one operation per file)
- Fragments: `virtocommerce/graphql/fragments/<entity>.graphql`
- Generated, never edited: `virtocommerce/graphql/generated/` (`graphql.ts`, `gql.ts`, `index.ts`, `schema.graphql`)
- Codegen config: `virtocommerce/codegen.ts` (`graphqlCodegenConfig` from the framework; schema from
  `BACKEND_BASE_URL/graphql`, custom scalars listed with `strictScalars`)
- Line-item lookup: `virtocommerce/graphql/line-items.ts` (`lineItemOf`)

## Step 1: Check What Exists

```
virtocommerce/graphql/operations/<area>/        the operation may exist, or a sibling needs one more field
virtocommerce/graphql/fragments/                reuse fragments instead of listing fields again
virtocommerce/graphql/generated/schema.graphql  the platform schema: argument names, input types, nullability
```

## Step 2: Write the Document

Mutation (`virtocommerce/graphql/operations/cart/add-item.graphql`):

```graphql
mutation AddItem($command: InputAddItemType!) {
  addItem(command: $command) {
    ...Cart
  }
}
```

Query (`virtocommerce/graphql/operations/cart/get-cart.graphql`):

```graphql
query GetCart(
  $storeId: String!
  $userId: String!
  $currencyCode: String!
  $cultureName: String!
  $cartId: String
  $cartName: String
) {
  cart(
    storeId: $storeId
    userId: $userId
    currencyCode: $currencyCode
    cultureName: $cultureName
    cartId: $cartId
    cartName: $cartName
  ) {
    ...Cart
  }
}
```

- Operation names are PascalCase and unique; the constant is `<Name>Document` (`GetCart` → `GetCartDocument`).
- Variable names match `StoreContext` (`storeId`, `userId`, `currencyCode`, `cultureName`) so specs can spread
  `shopper.storeContext`.
- Select through fragments (`...Cart`, `...Money`); add a field to the fragment when every user needs it.
- Mutations take the `command` input object the schema defines.
- Select only what tests read. Fields of an optional module stay out of shared fragments.

## Step 3: Regenerate

```shell
npm run codegen:vc            # builds the framework, then regenerates the GraphQL and REST types
npm run codegen:vc:graphql    # GraphQL only, once the framework is built (npm run build)
npm run typecheck
npm run check
```

The generation needs the platform running at `BACKEND_BASE_URL` (read from `virtocommerce/.env` by
`virtocommerce/env.ts`), and `virtocommerce/codegen.ts` loads the framework from its built `dist/`, so
`codegen:vc:graphql` alone works only after `npm run build`. Commit the documents and the regenerated files
together.

## Step 4: Use It

```ts
import { AddItemDocument } from "@graphql/generated/graphql.ts";
import { requireFields } from "@support/require-fields.ts";
import { uniqueId } from "@support/unique-id.ts";

const { addItem } = await shopper.graphql.execute(AddItemDocument, {
  command: { ...shopper.storeContext, cartName: uniqueId("test-cart"), productId, quantity: 1 },
});
const cart = requireFields(addItem, ["id"], "Cart with the product");
```

- `execute(document, variables)` returns typed `data` and throws a `GraphqlError` on errors; specs assert expected
  errors with `rejects.toThrow("[CODE]")`.
- `executeRaw(document, variables)` returns `data` and `errors` without throwing, for partial data or several
  errors.
- Variables are optional only when every variable of the document is optional.
- Results are nullable as in the schema: unwrap with `requireFields` / `requireDefined` / `lineItemOf`.

## Step 5: Arrange Method (when several specs need it)

Setup that more than one spec performs becomes a method of the `arrange` domain in
`virtocommerce/arrange/<domain>.ts`. A domain is a factory function, such as `cartsArrange(context)`, that returns
the methods of its interface (`CartsArrange`). Add the method in three places: the interface, with a short JSDoc
saying what it creates and what it removes; a `function` declaration inside the factory; and the returned object.
The method takes the `Shopper` it acts for, registers its own removal with `later` from the `ArrangeContext`, and
imports the generated documents and support code by relative paths (`cart` of `carts.ts`, shortened):

```ts
async function cart(shopper: Shopper, items: readonly CartItem[]): Promise<ArrangedCart> {
  removeDefaultCartLater(shopper);
  const { addItemsCart } = await shopper.graphql.execute(AddItemsCartDocument, {
    command: { ...shopper.storeContext, cartItems: [...items] },
  });
  return requireFields(addItemsCart, ["id"], `The cart of ${shopper.userId}`);
}
```

The platform assigns GraphQL ids, so removal is registered right after the create, or before it when the removal
finds the record itself (`removeDefaultCartLater` reads the default cart). Data created as the administrator (the role `roleFor.admin` names, if the facts have one)
uses `await admin()` from the context. Export new result types from `virtocommerce/arrange/index.ts`. A read that one
spec uses stays in that spec, as a table row lambda or a `function` declaration at its end.

## Where REST Is Needed

Some setup or checks have no xAPI operation. There are no REST clients: call the endpoint directly with the
`HttpClient` (`api`, `shopper.api`, or `await admin()` inside `arrange`), such as
`(await api.get(path)).expectOk().json<T>()`, and type the body with `@rest/generated/platform.ts`
(`../rest/generated/platform.ts` inside `arrange`). Missing or outdated REST types: regenerate with
`npm run codegen:vc:rest` (needs the running platform); never edit the generated file.

## Rules

1. Documents only under `virtocommerce/graphql/operations` and `virtocommerce/graphql/fragments`; no inline query
   strings.
2. Never edit `virtocommerce/graphql/generated/`; regenerate.
3. Reuse and extend fragments instead of duplicating field lists.
4. Remove documents no spec or arrange method uses, then regenerate.
5. Methods that create data live in `virtocommerce/arrange/` and register their own removal.
6. JSDoc only for what the signature cannot say; the rest of the style comes from the repository's `CLAUDE.md`.

## Example from this repository

- Reference documents: `virtocommerce/graphql/operations/cart/add-item.graphql`,
  `virtocommerce/graphql/operations/cart/get-cart.graphql`; codegen config `virtocommerce/codegen.ts`.
- Operation areas: cart, category, contact, marketing, order, page-context, pickup-location, product, quote,
  save-for-later, seo, shopping-list.
- Regenerate with `npm run codegen:vc` (or `npm run build && npm run codegen:vc:graphql`), then
  `npm run typecheck`.
- Reference arrange method: `cart` in `virtocommerce/arrange/carts.ts` (`arrange.carts.cart`).
