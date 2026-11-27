import type { VirtoCommerceStoreModuleCoreModelStore as Store } from "../rest/generated/platform.ts";

import { uniqueId } from "../support/unique-id.ts";

/** A store to create, with its id, name and catalog. */
export type StoreDraft = Store & { readonly id: string; readonly name: string; readonly catalog: string };

/**
 * Returns a new open store.
 *
 * @param catalogId - The catalog of the store.
 * @returns The store, with a unique id that is also its name.
 */
export function newStore(catalogId: string): StoreDraft {
  const id = uniqueId("test-store");
  return { id, name: id, catalog: catalogId, storeState: "Open" };
}
