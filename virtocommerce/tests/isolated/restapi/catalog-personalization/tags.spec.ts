import type { ArrangedCategory, ArrangedProduct } from "@arrange";
import type { VirtoCommerceCatalogPersonalizationModuleCoreModelTaggedItem as TaggedItem } from "@rest/generated/platform.ts";

import { taggedCategory, taggedProduct } from "@builders/personalization.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { setTags } from "@support/personalization.ts";
import { pushNotificationOf } from "@support/push-notifications.ts";
import { uniqueId } from "@support/unique-id.ts";
import { DESTRUCTIVE_TAG } from "@virtocommerce/test-automation-framework/core";

const MEMBER_GROUPS_SETTING = "Customer.MemberGroups";
const INHERITANCE_POLICY_SETTING = "CatalogPersonalization.TagsInheritancePolicy";
const PERSONALIZATION_PATH = "/api/personalization";
const SYNCHRONIZATION_TIMEOUT_MS = 60_000;

interface ProductInCategory {
  readonly category: ArrangedCategory;
  readonly product: ArrangedProduct;
}

interface OutlineSynchronization {
  readonly id?: string | null;
  readonly finished?: string | null;
  readonly errorCount?: number | null;
  readonly errors?: readonly string[] | null;
}

const INHERITANCE_POLICIES = [
  {
    policy: "DownTree",
    tagged: "category",
    inheriting: "product",
    taggedEntity: ({ category }: ProductInCategory) => taggedCategory(category),
    inheritingId: ({ product }: ProductInCategory) => product.id,
  },
  {
    policy: "UpTree",
    tagged: "product",
    inheriting: "category",
    taggedEntity: ({ product }: ProductInCategory) => taggedProduct(product),
    inheritingId: ({ category }: ProductInCategory) => category.id,
  },
] as const;

test.describe("personalization settings (store administrator, global settings)", { tag: DESTRUCTIVE_TAG }, () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("a tag added to the member groups is listed as a member group", async ({ api, arrange }) => {
    const group = uniqueId("test-group");
    await test.step(`arrange: add ${group} to ${MEMBER_GROUPS_SETTING}`, () =>
      arrange.platform.allowedValue(MEMBER_GROUPS_SETTING, group));

    const groups = await test.step("act: get the member groups", async () =>
      (await api.get(`/api/platform/settings/values/${MEMBER_GROUPS_SETTING}`)).expectOk().json<unknown[]>());

    await test.step(`assert: ${group} is a member group`, () => {
      expect(groups).toContain(group);
    });
  });

  for (const { policy, tagged, inheriting, taggedEntity, inheritingId } of INHERITANCE_POLICIES) {
    test(`with the ${policy} policy, a ${inheriting} inherits the tag of its ${tagged}`, async ({ api, arrange }) => {
      await test.step(`arrange: the ${policy} inheritance policy`, () =>
        arrange.platform.setting(INHERITANCE_POLICY_SETTING, policy));
      const tree = await test.step("arrange: a product in a category", async () => {
        const category = await arrange.catalog.category((await arrange.catalog.catalog()).id);
        return { category, product: await arrange.catalog.product(category) };
      });
      const entity = taggedEntity(tree);
      const tag = uniqueId("test-tag");
      arrange.catalog.clearTagsLater(entity);

      await test.step(`act: tag the ${tagged}`, () => setTags(api, entity, [tag]));

      await test.step(`assert: the ${inheriting} inherits the tag`, async () => {
        const item = (await api.get(`${PERSONALIZATION_PATH}/taggeditem/${inheritingId(tree)}`))
          .expectOk()
          .json<TaggedItem>();
        expect(item.inheritedTags).toContain(tag);
      });
    });
  }

  test("synchronize the catalog outlines", async ({ api, arrange }) => {
    await test.step("arrange: the UpTree inheritance policy", () =>
      arrange.platform.setting(INHERITANCE_POLICY_SETTING, "UpTree"));

    const started = await test.step("act: start the outlines synchronization", async () =>
      (await api.post(`${PERSONALIZATION_PATH}/outlines/synchronize`, { json: {} }))
        .expectOk()
        .json<OutlineSynchronization>());

    await test.step("assert: the synchronization finishes without errors", async () => {
      const id = String(started.id);
      await expect
        .poll(async () => (await pushNotificationOf<OutlineSynchronization>(api, id))?.finished, {
          timeout: SYNCHRONIZATION_TIMEOUT_MS,
        })
        .toEqual(expect.any(String));
      expect(await pushNotificationOf<OutlineSynchronization>(api, id)).toMatchObject({ errorCount: 0, errors: [] });
    });
  });
});
