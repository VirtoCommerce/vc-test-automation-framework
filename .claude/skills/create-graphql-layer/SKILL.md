---
name: create-graphql-layer
description: "Add xAPI GraphQL operations and fragments as .graphql documents, regenerate the typed documents with GraphQL Code Generator, and add dataset helpers around them when several specs need them"
argument-hint: "<area> <operation>"
---

## GraphQL Layer

There are no hand-written operation classes or model types. A query or mutation is a `.graphql` document; GraphQL Code Generator turns every document into a typed `…Document` constant plus result and variables types, and `GraphqlClient` executes those constants.

## File Locations

- Operations: `api/graphql/operations/<area>/<operation-name>.graphql` (kebab-case file, one operation per file)
- Fragments: `api/graphql/fragments/<entity>.graphql`
- Generated (never edit): `api/graphql/generated/graphql.ts`, `gql.ts`, `schema.graphql`
- Codegen config: `codegen-graphql.ts` (schema from `BACKEND_BASE_URL/graphql`)

## Step 1: Check What Exists

```
api/graphql/operations/<area>/     maybe the operation exists, or a sibling needs one more field
api/graphql/fragments/             reuse fragments instead of listing fields again
api/graphql/generated/schema.graphql   the platform schema: argument and field names, input types
```

## Step 2: Write the Document

Fragment (`api/graphql/fragments/cart.graphql`):

```graphql
fragment Cart on CartType {
  id
  storeId
  customerId
  itemsQuantity
  total {
    ...Money
  }
  items {
    ...LineItem
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

Mutation (`api/graphql/operations/cart/add-item.graphql`):

```graphql
mutation AddItem($command: InputAddItemType!) {
  addItem(command: $command) {
    ...Cart
  }
}
```

**Rules:**
- Operation names are PascalCase and unique; the generated constant is `<Name>Document` (`GetCart` → `GetCartDocument`)
- Select through fragments (`...Cart`, `...Money`); add a field to the fragment when every user of it needs the field
- Mutations take the `command` input object the schema defines
- Only select what tests read; large selections slow every call that uses the fragment

## Step 3: Regenerate

```shell
npm run codegen:graphql   # needs the platform running at BACKEND_BASE_URL
npm run typecheck
```

Commit the documents and the regenerated files together.

## Step 4: Use It

```ts
import { AddItemDocument } from "@api/graphql/generated/graphql";

const { addItem } = await graphqlClient.execute(AddItemDocument, {
  command: { ...cartScope(frontendContext), cartName: uniqueId("test-cart"), productId, quantity: 1 },
});
const cart = requireCart(addItem, "Cart with the product");
```

- `execute(document, variables)` returns the typed `data` and throws `GraphqlError` on errors (message includes each error's code and path)
- `executeRaw(document, variables)` returns `{ operationName, status, data, errors }` for tests that assert on errors
- Variables are optional in the call only when every variable in the document is optional
- Results are nullable as in the schema: unwrap with `requireFields`/`requireCart`/`lineItemFor`

## Step 5: Shared Helper (when several specs need it)

Wrap the document in `dataset/arrange/<area>.ts` when more than one spec performs the same setup, registering cleanup inside the helper:

```ts
export async function arrangeQuoteFromCart(
  graphqlClient: GraphqlClient,
  platformAdminHttpClient: HttpClient,
  cleanupStack: CleanupStack,
  cartId: string,
): Promise<ArrangedQuote> {
  const { createQuoteFromCart } = await graphqlClient.execute(CreateQuoteFromCartDocument, {
    command: { cartId, comment: "Quote requested by an automated test" },
  });
  return registerQuoteRemoval(platformAdminHttpClient, cleanupStack, createQuoteFromCart);
}
```

Read-only wrappers used by one spec stay in that spec.

## Rules

1. Documents only under `api/graphql/operations` and `api/graphql/fragments`; never inline query strings in code
2. Never edit `api/graphql/generated/*`; regenerate with `npm run codegen:graphql`
3. Reuse fragments; extend them instead of duplicating field lists
4. Remove documents no spec uses, then regenerate
5. Helpers that create data live in `dataset/arrange` and register their own cleanup
