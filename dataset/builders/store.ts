import type { StoreData } from "@api/rest/types/store";
import type { WithRequired } from "@core/required-fields";

import { uniqueId } from "@core/unique-id";

/** A store to create, with its id chosen up front. */
export type StoreDraft = WithRequired<StoreData, "id" | "name" | "catalog">;

/**
 * Builds an open store whose id and name are one unique `test-store-…` value.
 *
 * @param catalogId - Such as the store under test's catalog.
 */
export function newStore(catalogId: string): StoreDraft {
  const id = uniqueId("test-store");
  return { id, name: id, catalog: catalogId, storeState: "Open" };
}
