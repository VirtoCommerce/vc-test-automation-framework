import type {
  VirtoCommercePricingModuleCoreModelPricelistAssignment as PricelistAssignment,
  VirtoCommercePricingModuleCoreModelSearchPricelistAssignmentSearchResult as PricelistAssignmentSearchResult,
} from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { newPricelistAssignment } from "@builders/pricing.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";

const ASSIGNMENTS_PATH = "/api/pricing/assignments";
const UPDATED_FIELDS = ["name", "description"] as const;

test.describe("pricelist assignments (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("assign a pricelist to the store's catalog", async ({ api, arrange, store }) => {
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());
    const draft = newPricelistAssignment(pricelist.id, store.catalog);
    arrange.pricing.deletePricelistAssignmentLater(draft.id);

    const assignment = await test.step("act: create an assignment", async () =>
      (await api.post(ASSIGNMENTS_PATH, { json: draft })).expectOk().json<PricelistAssignment>());

    await test.step("assert: the assignment links the pricelist to the store's catalog", () => {
      expect(assignment).toMatchObject({ name: draft.name, pricelistId: pricelist.id, catalogId: store.catalog });
    });
  });

  test("get a new assignment template", async ({ api }) => {
    const template = await test.step("act: get a new assignment template", async () =>
      (await api.get(`${ASSIGNMENTS_PATH}/new`)).expectOk().json<PricelistAssignment>());

    await test.step("assert: the template has no id and a PriceConditionTree", () => {
      expect(template.id ?? undefined).toBeUndefined();
      expect(template.dynamicExpression).toMatchObject({
        id: "PriceConditionTree",
        availableChildren: [expect.objectContaining({ id: "BlockPricingCondition" })],
      });
    });
  });

  test("get an assignment by id", async ({ api, arrange }) => {
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());
    const assignment = await test.step("arrange: its assignment", () =>
      arrange.pricing.pricelistAssignment(pricelist.id));

    const reloaded = await test.step("act: get the assignment", () => assignmentOf(api, assignment.id));

    await test.step("assert: the fields match the created assignment", () => {
      expect(reloaded).toMatchObject({ id: assignment.id, name: assignment.name });
    });
  });

  test("search assignments by pricelist", async ({ api, arrange }) => {
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());
    const assignment = await test.step("arrange: its assignment", () =>
      arrange.pricing.pricelistAssignment(pricelist.id));

    const found = await test.step("act: search assignments by the pricelist", async () =>
      (
        (await api.get(ASSIGNMENTS_PATH, { query: { priceListId: pricelist.id } }))
          .expectOk()
          .json<PricelistAssignmentSearchResult>().results ?? []
      ).map(({ id }) => id));

    await test.step("assert: exactly the assignment is found", () => {
      expect(found).toEqual([assignment.id]);
    });
  });

  for (const field of UPDATED_FIELDS) {
    test(`change the ${field} of an assignment`, async ({ api, arrange }) => {
      const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());
      const assignment = await test.step("arrange: its assignment", () =>
        arrange.pricing.pricelistAssignment(pricelist.id));
      const value = `${assignment.name} ${field} changed`;

      await test.step(`act: change the assignment's ${field}`, async () =>
        (await api.put(ASSIGNMENTS_PATH, { json: { ...assignment, [field]: value } })).expectOk());

      await test.step(`assert: the assignment has the new ${field}`, async () => {
        expect((await assignmentOf(api, assignment.id))?.[field]).toBe(value);
      });
    });
  }

  test("delete an assignment", async ({ api, arrange }) => {
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());
    const assignment = await test.step("arrange: its assignment", () =>
      arrange.pricing.pricelistAssignment(pricelist.id));

    await test.step("act: delete the assignment", async () =>
      (await api.delete(ASSIGNMENTS_PATH, { query: { ids: [assignment.id] } })).expectOk());

    await test.step("assert: the assignment is not found", async () => {
      expect(await assignmentOf(api, assignment.id)).toBeUndefined();
    });
  });

  test("delete the assignments matching a search", async ({ api, arrange }) => {
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());
    const assignment = await test.step("arrange: its assignment", () =>
      arrange.pricing.pricelistAssignment(pricelist.id));

    await test.step("act: delete the assignments matching its name and pricelist", async () =>
      (
        await api.delete("/api/pricing/filteredAssignments", {
          query: { keyword: assignment.name, priceListId: pricelist.id },
        })
      ).expectOk());

    await test.step("assert: the assignment is not found", async () => {
      expect(await assignmentOf(api, assignment.id)).toBeUndefined();
    });
  });
});

async function assignmentOf(api: HttpClient, id: string): Promise<PricelistAssignment | undefined> {
  return (await api.get(`${ASSIGNMENTS_PATH}/${id}`)).optionalJson<PricelistAssignment>();
}
