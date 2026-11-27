import type { HttpClient } from "@virtocommerce/test-automation-framework/http";
import type { VirtoCommerceStoreModuleCoreModelStore as Store } from "../rest/generated/platform.ts";
import type { WithRequired } from "./require-fields.ts";

import { GraphqlClient } from "@virtocommerce/test-automation-framework/graphql";

import { StoreByDomainDocument } from "../graphql/generated/graphql.ts";
import { requireFields } from "./require-fields.ts";

/** The store under test as the platform has it, with the fields that tests build on. */
export type StoreUnderTest = WithRequired<Store, "id" | "name" | "catalog" | "defaultLanguage" | "defaultCurrency">;

/**
 * Finds the store that the frontend serves, as the frontend itself does: xAPI resolves the store from the host name of
 * the frontend. The store is then read from the platform, so its catalog, languages and currencies are the platform's,
 * also on a platform that another dataset seeded.
 *
 * @param admin - A client signed in as a user who may read stores.
 * @param frontendBaseUrl - The origin of the frontend, such as `env.FRONTEND_BASE_URL`.
 * @returns The store.
 * @throws {Error} No store serves the frontend's host name, or the store lacks one of the fields that tests build on.
 */
export async function findStoreUnderTest(admin: HttpClient, frontendBaseUrl: string): Promise<StoreUnderTest> {
  const domain = new URL(frontendBaseUrl).host;
  const { store: served } = await new GraphqlClient(admin).execute(StoreByDomainDocument, { domain });
  if (served === null) {
    throw new Error(
      `No store serves the frontend ${domain} (FRONTEND_BASE_URL). Seed the dataset, or set the URL of the store ` +
        "on the platform to the frontend's address.",
    );
  }
  const response = await admin.get(`/api/stores/${encodeURIComponent(served.storeId)}`);
  const store = requireFields(response.optionalJson<Store>(), ["id"], `Store "${served.storeId}"`);
  return requireFields(store, ["id", "name", "catalog", "defaultLanguage", "defaultCurrency"], `Store "${store.id}"`);
}
