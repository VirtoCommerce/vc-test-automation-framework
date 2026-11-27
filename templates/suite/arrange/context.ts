import type { Credentials } from "@virtocommerce/test-automation-framework/auth";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";
import type { StoreUnderTest } from "../support/store.ts";

/** What the domains of `arrange` create and remove data with. */
export interface ArrangeContext {
  /** Returns a client signed in as the administrator; it signs in on the first call. */
  readonly admin: () => Promise<HttpClient>;
  /** Returns a client signed in as a user. */
  readonly signIn: (credentials: Credentials) => Promise<HttpClient>;
  /** The store under test. */
  readonly store: StoreUnderTest;
  /** Registers an action that removes data after the test. The actions run last first. */
  readonly later: (description: string, undo: () => Promise<unknown>) => void;
}
