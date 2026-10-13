import type { StoreData } from "@api/rest/types/store";
import type { WithRequired } from "@core/required-fields";
import type { Dataset } from "./dataset";

import { requireFields } from "@core/required-fields";

/** The dataset record of the store under test, with the fields tests build on. */
export type StoreUnderTest = WithRequired<StoreData, "id" | "name" | "catalog" | "defaultLanguage" | "defaultCurrency">;

/**
 * Finds the store under test in the dataset, requiring its catalog, default language and default currency.
 *
 * @param storeId - Such as `env.storeId`.
 * @throws Error when the dataset has no such store or it lacks one of those fields.
 */
export function storeUnderTest(dataset: Dataset, storeId: string): StoreUnderTest {
  return requireFields(
    dataset.stores.get(storeId),
    ["id", "name", "catalog", "defaultLanguage", "defaultCurrency"],
    `Dataset store "${storeId}"`,
  );
}
