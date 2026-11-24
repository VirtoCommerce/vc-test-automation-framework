# GraphQL

The `graphql` area runs typed GraphQL operations, such as the operations of the Virto Commerce API (xAPI).

## Documents

The framework does not define operations. A test suite generates typed documents from its operations with GraphQL
Code Generator, in the string document mode, and passes them to the client. Each document carries the types of its
result and its variables, so the data and the variables are typed without a GraphQL package in the framework.

For the setup, see [Generating types](../guides/generating-types.md#graphql). `graphqlCodegenConfig` returns the
configuration that produces documents the client accepts.

## The client

`GraphqlClient` sends operations through an `HttpClient`, usually a signed-in one, so sign-in, token renewal, the
single origin and test traces work as for any request. The endpoint is `/graphql` unless another path is given.

| Method       | Returns                             | Throws a `GraphqlError` when                                |
| ------------ | ----------------------------------- | ----------------------------------------------------------- |
| `execute`    | The data of the response            | The response has errors, even with partial data, or no data |
| `executeRaw` | The data, the errors and the status | Never; use it in tests that check errors or partial data    |

- Variables are optional only for an operation without required variables. Each string in them can be a `Secret`,
  revealed only when the operation is sent.
- GraphQL errors are read from a response with any status, because a server can return them with a success status or,
  for an invalid operation, with a 400 status.
- Both methods throw an `HttpError` for a failed status without GraphQL errors, and for a body that is not a GraphQL
  response.

<!-- example: ../examples/graphql.ts -->
```ts
import type { GraphqlDocument } from "@virtocommerce/test-automation-framework/graphql";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { expect } from "@playwright/test";
import { GraphqlClient, GraphqlError } from "@virtocommerce/test-automation-framework/graphql";

type Cart = { readonly cart: { readonly id: string; readonly itemsCount: number } };
type CartVariables = { readonly storeId: string; readonly userId: string };

export async function countCartItems(
  signedIn: HttpClient,
  getCart: GraphqlDocument<Cart, CartVariables>,
  variables: CartVariables,
): Promise<number> {
  const { cart } = await new GraphqlClient(signedIn).execute(getCart, variables);
  return cart.itemsCount;
}

export async function expectRejectedWithCode(
  signedIn: HttpClient,
  getCart: GraphqlDocument<Cart, CartVariables>,
  variables: CartVariables,
  code: string,
): Promise<void> {
  const result = await new GraphqlClient(signedIn).executeRaw(getCart, variables);

  expect(result.errors.map((entry) => entry.extensions?.["code"])).toContain(code);
}

export function isMissingObject(error: unknown): boolean {
  return GraphqlError.hasCode(error, "NOT_FOUND", "OBJECT_NOT_FOUND");
}
```

## Errors

`GraphqlError` represents a response that has errors, or one that has no data.

- The message names the operation and the HTTP status, then lists each error with its code and path, such as
  `- [VALIDATION_ERROR] Quantity must be positive (at addItem)`.
- `errors` holds the error entries of the response, including fields that the server adds, such as `locations`.
- Secrets are masked in the message and in the entries, because servers often quote variable values in their errors.
- `GraphqlError.hasCode(error, ...codes)` tells whether an unknown value is a `GraphqlError` with an entry whose
  `extensions.code` is one of the codes.
