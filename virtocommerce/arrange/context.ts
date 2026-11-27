import type { Credentials } from "@virtocommerce/test-automation-framework/auth";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";
import type { StoreUnderTest } from "../support/store-under-test.ts";

/** What the domains of `arrange` create and remove data with. */
export interface ArrangeContext {
  /** Returns a client signed in as the store administrator of the dataset; it signs in on the first call. */
  readonly admin: () => Promise<HttpClient>;
  /** Returns a client signed in as a user. */
  readonly signIn: (credentials: Credentials) => Promise<HttpClient>;
  /** Signs a user out of the API and the browsers, before the user is deleted. */
  readonly signOut: (credentials: Credentials) => Promise<void>;
  /** The store under test. */
  readonly store: StoreUnderTest;
  /** Registers an action that removes data after the test. The actions run last first. */
  readonly later: (description: string, undo: () => Promise<unknown>) => void;
}
