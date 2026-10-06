import type { CompletenessChannelData } from "@api/rest/types/completeness";

import { uniqueId } from "@core/unique-id";

import { SEEDED_CATALOG_ID, SEEDED_CATALOG_NAME, SEEDED_CURRENCY, SEEDED_LANGUAGE } from "../seeded";

export const DEFAULT_COMPLETENESS_EVALUATOR = "DefaultCompletenessEvaluator";

export function newCompletenessChannel(name = uniqueId("test-channel")): CompletenessChannelData {
  return {
    name,
    catalogId: SEEDED_CATALOG_ID,
    catalogName: SEEDED_CATALOG_NAME,
    evaluatorType: DEFAULT_COMPLETENESS_EVALUATOR,
    languages: [SEEDED_LANGUAGE],
    currencies: [SEEDED_CURRENCY],
  };
}
