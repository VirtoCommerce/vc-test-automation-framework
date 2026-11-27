import type { VirtoCommerceCatalogPublishingModuleCoreModelCompletenessChannel as CompletenessChannel } from "../rest/generated/platform.ts";
import type { StoreUnderTest } from "../support/store-under-test.ts";

import { randomUUID } from "node:crypto";

import { uniqueId } from "../support/unique-id.ts";

/** The completeness evaluator that the platform ships. */
export const DEFAULT_COMPLETENESS_EVALUATOR = "DefaultCompletenessEvaluator";

/** A completeness channel to create, with its identifier, name and catalog. */
export type CompletenessChannelDraft = CompletenessChannel & {
  readonly id: string;
  readonly name: string;
  readonly catalogId: string;
};

/**
 * Returns a new completeness channel for the catalog, default language and default currency of the store.
 *
 * @param store - The store under test.
 * @param catalogName - The name of the store's catalog.
 * @returns The channel, with a unique name and the default evaluator.
 */
export function newCompletenessChannel(store: StoreUnderTest, catalogName: string | null): CompletenessChannelDraft {
  return {
    id: randomUUID(),
    name: uniqueId("test-channel"),
    catalogId: store.catalog,
    catalogName,
    evaluatorType: DEFAULT_COMPLETENESS_EVALUATOR,
    languages: [store.defaultLanguage],
    currencies: [store.defaultCurrency],
  };
}
