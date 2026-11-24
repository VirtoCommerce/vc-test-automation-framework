import type { Credentials } from "@virtocommerce/test-automation-framework/auth";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";
import type { StoreUnderTest } from "./store.ts";

import { GraphqlClient } from "@virtocommerce/test-automation-framework/graphql";

/** The store, user, currency and language that most xAPI operations take. */
export interface StoreContext {
  readonly storeId: string;
  readonly userId: string;
  readonly currencyCode: string;
  readonly cultureName: string;
}

/** A frontend user on the API: an anonymous visitor or a signed-in customer, as the frontend browser is. */
export interface Shopper {
  /** The credentials of the customer, or `undefined` for an anonymous visitor. */
  readonly credentials: Credentials | undefined;
  /** The identifier of the customer, or the random identifier of the anonymous visitor. */
  readonly userId: string;
  /** A client of the platform that acts as the shopper. */
  readonly api: HttpClient;
  /** An xAPI client that acts as the shopper. */
  readonly graphql: GraphqlClient;
  /** The store context of the shopper, for xAPI operations. */
  readonly storeContext: StoreContext;
}

/**
 * Returns a shopper of the store under test, in the default currency and language of the store.
 *
 * @param api - A client that acts as the shopper: anonymous, or signed in as the customer.
 * @param store - The store under test.
 * @param userId - The identifier of the customer, or a random one for an anonymous visitor.
 * @param credentials - The credentials of the customer; omit them for an anonymous visitor.
 * @returns The shopper.
 */
export function shopperOf(api: HttpClient, store: StoreUnderTest, userId: string, credentials?: Credentials): Shopper {
  return {
    credentials,
    userId,
    api,
    graphql: new GraphqlClient(api),
    storeContext: {
      storeId: store.id,
      userId,
      currencyCode: store.defaultCurrency,
      cultureName: store.defaultLanguage,
    },
  };
}
