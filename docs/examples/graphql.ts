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
