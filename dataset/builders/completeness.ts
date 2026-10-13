import type { CatalogData } from "@api/rest/types/catalog";
import type { CompletenessChannelData } from "@api/rest/types/completeness";
import type { WithRequired } from "@core/required-fields";
import type { StoreUnderTest } from "../store-under-test";

import { randomUUID } from "node:crypto";

import { uniqueId } from "@core/unique-id";

/** The evaluator every platform ships; channels use it unless told otherwise. */
export const DEFAULT_COMPLETENESS_EVALUATOR = "DefaultCompletenessEvaluator";

/** A completeness channel to create, with a unique name. */
export type CompletenessChannelDraft = WithRequired<CompletenessChannelData, "id" | "name" | "catalogId">;

/**
 * Builds a completeness channel named `test-channel-…` with the default evaluator, over the store's catalog
 * in its default language and currency.
 *
 * @param catalog - The store's dataset catalog; its name becomes the channel's `catalogName`.
 */
export function newCompletenessChannel(
  store: StoreUnderTest,
  catalog: Pick<CatalogData, "name">,
): CompletenessChannelDraft {
  return {
    id: randomUUID(),
    name: uniqueId("test-channel"),
    catalogId: store.catalog,
    catalogName: catalog.name ?? null,
    evaluatorType: DEFAULT_COMPLETENESS_EVALUATOR,
    languages: [store.defaultLanguage],
    currencies: [store.defaultCurrency],
  };
}
