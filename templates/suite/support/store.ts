import type { HttpClient } from "@virtocommerce/test-automation-framework/http";
import type { WithRequired } from "./require-fields.ts";

import { requireFields } from "./require-fields.ts";

/** A store as the platform returns it, with the fields that tests build on. */
export interface Store {
  readonly id?: string | null;
  readonly name?: string | null;
  readonly catalog?: string | null;
  readonly defaultLanguage?: string | null;
  readonly defaultCurrency?: string | null;
}

/** The store under test. */
export type StoreUnderTest = WithRequired<Store, "id" | "name" | "catalog" | "defaultLanguage" | "defaultCurrency">;

/**
 * Reads the store under test from the platform.
 *
 * @param admin - A client signed in as a user who may read stores.
 * @param storeId - The identifier of the store, such as `env.STORE_ID`.
 * @returns The store.
 * @throws {Error} The store does not exist, or lacks a field that tests build on.
 */
export async function readStore(admin: HttpClient, storeId: string): Promise<StoreUnderTest> {
  const response = await admin.get(`/api/stores/${encodeURIComponent(storeId)}`);
  return requireFields(
    response.optionalJson<Store>(),
    ["id", "name", "catalog", "defaultLanguage", "defaultCurrency"],
    `Store "${storeId}" (STORE_ID)`,
  );
}
