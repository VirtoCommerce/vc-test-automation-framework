import type { HttpClient } from "@virtocommerce/test-automation-framework/http";
import type { TaggedEntity } from "../builders/personalization.ts";
import type { VirtoCommerceCatalogPersonalizationModuleCoreModelSearchTaggedItemSearchResult as TaggedItemSearchResult } from "../rest/generated/platform.ts";

const PERSONALIZATION_PATH = "/api/personalization";

/**
 * Sets the personalization tags of a product or category, replacing the tags it has.
 *
 * @param api - A client signed in as a user who may tag.
 * @param entity - The product or category.
 * @param tags - The tags; none clears them.
 */
export async function setTags(api: HttpClient, entity: TaggedEntity, tags: readonly string[]): Promise<void> {
  const search = await api.post(`${PERSONALIZATION_PATH}/search`, { json: { entityIds: [entity.entityId] } });
  const existing = search.expectOk().json<TaggedItemSearchResult>().results?.[0];
  const json = { ...entity, id: existing?.id ?? null, tags: [...tags] };
  (await api.put(`${PERSONALIZATION_PATH}/taggeditem`, { json })).expectOk();
}
