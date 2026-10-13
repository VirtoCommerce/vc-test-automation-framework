---
name: create-graphql-layer
description: "Add xAPI GraphQL operations and fragments as .graphql documents, regenerate the typed documents with GraphQL Code Generator, and add arrange methods around them when several specs need the same setup"
argument-hint: "<area> <operation>"
---

## GraphQL Layer

There are no hand-written operation classes or model types. An operation is a `.graphql` document; GraphQL Code
Generator turns it into a typed `…Document` constant plus result and variable types, and `api.graphql` executes
it.

## File Locations

- Operations: `api/graphql/operations/<area>/<operation-name>.graphql` (kebab-case, one operation per file)
- Fragments: `api/graphql/fragments/<entity>.graphql`
- Generated, never edited: `api/graphql/generated/` (`graphql.ts`, `gql.ts`, `schema.graphql`)
- Codegen config: `codegen-graphql.ts` (schema from `BACKEND_BASE_URL/graphql`)
- Client: `api/graphql/graphql-client.ts`; line-item lookup: `api/graphql/line-items.ts` (`lineItemOf`)

## Step 1: Check What Exists

```
api/graphql/operations/<area>/         the operation may exist, or a sibling needs one more field
api/graphql/fragments/                 reuse fragments instead of listing fields again
api/graphql/generated/schema.graphql   the platform schema: argument names, input types, nullability
```

## Step 2: Write the Document

Mutation (`api/graphql/operations/cart/add-item.graphql`):

```graphql
mutation AddItem($command: InputAddItemType!) {
  addItem(command: $command) {
    ...Cart
  }
}
```

Query (`api/graphql/operations/cart/get-cart.graphql`):

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
  `await api.storeContext()`.
- Select through fragments (`...Cart`, `...Money`); add a field to the fragment when every user needs it.
- Mutations take the `command` input object the schema defines.
- Select only what tests read.

## Step 3: Regenerate

```shell
npm run codegen:graphql   # needs the platform at BACKEND_BASE_URL; runs Biome on the output
npm run typecheck
```

Commit the documents and the regenerated files together.

## Step 4: Use It

```ts
import { AddItemDocument } from "@api/graphql/generated/graphql";

const { addItem } = await api.graphql.execute(AddItemDocument, {
  command: { ...(await api.storeContext()), cartName: uniqueId("test-cart"), productId, quantity: 1 },
});
const cart = requireFields(addItem, ["id"], "Cart with the product");
```

- `execute(document, variables)` returns typed `data` and throws `GraphqlError` on errors; specs assert expected
  errors with `rejects.toBeGraphqlError("CODE")`.
- `executeRaw(document, variables)` returns `{ operationName, status, data, errors }` without throwing, for
  partial data or several errors.
- Variables are optional only when every variable of the document is optional.
- Results are nullable as in the schema: unwrap with `requireFields` / `lineItemOf`.

## Step 5: Arrange Method (when several specs need it)

Setup that more than one spec performs becomes a method of the domain class in `dataset/arrange/<domain>.ts`. It
takes the shopper's `ApiSession`, registers its own cleanup, and has short JSDoc saying what it creates and what
it removes:

```ts
/** Creates a named cart with items in the shopper's session and removes it after the test. */
async cart(shopper: ApiSession, items: readonly ItemToAdd[]): Promise<ArrangedCart> {
  const { addItemsCart } = await shopper.graphql.execute(AddItemsCartDocument, {
    command: { ...(await shopper.storeContext()), cartName: uniqueId("test-cart"), cartItems: [...items] },
  });
  const cart = requireFields(addItemsCart, ["id"], "Arranged cart");
  await this.removeCartLater(shopper, cart.id);
  return cart;
}
```

The platform assigns GraphQL ids, so cleanup is pushed right after the create, before anything else can fail.
Export new result types from `dataset/arrange/index.ts`. A read used by one spec stays in that spec as a table
row lambda or an inline call, not a helper function.

## Rules

1. Documents only under `api/graphql/operations` and `api/graphql/fragments`; no inline query strings.
2. Never edit `api/graphql/generated/`; regenerate with `npm run codegen:graphql`.
3. Reuse and extend fragments instead of duplicating field lists.
4. Remove documents no spec or arrange method uses, then regenerate.
5. Methods that create data live in `dataset/arrange` and register their own cleanup.
6. No code comments; JSDoc only for what the signature cannot say.
