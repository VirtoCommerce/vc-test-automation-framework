import * as allure from "allure-js-commons";

import { newPricelistAssignment } from "@dataset/builders/pricing";
import { expect, test } from "@fixtures";

const UPDATED_FIELDS = ["name", "description"] as const;

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Pricing / Assignments");
});

test.describe("pricelist assignments (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("assign a pricelist to the store's catalog", async ({ api, arrange, cleanup, store }) => {
    await allure.story("Create");
    await allure.description("A new assignment links its pricelist to the store's catalog.");
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());
    const draft = newPricelistAssignment(pricelist.id, store.catalog);
    cleanup.push(`delete pricelist assignment ${draft.name}`, () => api.rest.pricing.assignments.delete([draft.id]));

    const assignment = await test.step("act: create an assignment", () => api.rest.pricing.assignments.create(draft));

    await test.step("assert: the assignment links the pricelist to the store's catalog", () => {
      expect(assignment).toMatchObject({ name: draft.name, pricelistId: pricelist.id, catalogId: store.catalog });
    });
  });

  test("get a new assignment template", async ({ api }) => {
    await allure.story("Create");
    await allure.description("The template of a new assignment is unsaved, with a block pricing condition to add.");

    const template = await test.step("act: get a new assignment template", () =>
      api.rest.pricing.assignments.template());

    await test.step("assert: the template has no id and a PriceConditionTree", () => {
      expect(template.id ?? undefined).toBeUndefined();
      expect(template.dynamicExpression).toMatchObject({
        id: "PriceConditionTree",
        availableChildren: [expect.objectContaining({ id: "BlockPricingCondition" })],
      });
    });
  });

  test("get an assignment by id", async ({ api, arrange }) => {
    await allure.story("Read");
    await allure.description("An assignment is read back by its id.");
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());
    const assignment = await test.step("arrange: its assignment", () =>
      arrange.pricing.pricelistAssignment(pricelist.id));

    const reloaded = await test.step("act: get the assignment", () => api.rest.pricing.assignments.get(assignment.id));

    await test.step("assert: the fields match the created assignment", () => {
      expect(reloaded).toMatchObject({ id: assignment.id, name: assignment.name });
    });
  });

  test("search assignments by pricelist", async ({ api, arrange }) => {
    await allure.story("Search");
    await allure.description("Searching assignments by a new pricelist finds exactly its assignment.");
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());
    const assignment = await test.step("arrange: its assignment", () =>
      arrange.pricing.pricelistAssignment(pricelist.id));

    const found = await test.step("act: search assignments by the pricelist", () =>
      api.rest.pricing.assignments.search({ priceListId: pricelist.id }));

    await test.step("assert: exactly the assignment is found", () => {
      expect(found.map(({ id }) => id)).toEqual([assignment.id]);
    });
  });

  for (const field of UPDATED_FIELDS) {
    test(`change the ${field} of an assignment`, async ({ api, arrange }) => {
      await allure.story("Update");
      await allure.description(`An assignment's new ${field} is stored.`);
      const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());
      const assignment = await test.step("arrange: its assignment", () =>
        arrange.pricing.pricelistAssignment(pricelist.id));
      const value = `${assignment.name} ${field} changed`;

      await test.step(`act: change the assignment's ${field}`, () =>
        api.rest.pricing.assignments.update({ ...assignment, [field]: value }));

      await test.step(`assert: the assignment has the new ${field}`, async () => {
        expect((await api.rest.pricing.assignments.get(assignment.id))[field]).toBe(value);
      });
    });
  }

  test("delete an assignment", async ({ api, arrange }) => {
    await allure.story("Delete");
    await allure.description("A deleted assignment is no longer found.");
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());
    const assignment = await test.step("arrange: its assignment", () =>
      arrange.pricing.pricelistAssignment(pricelist.id));

    await test.step("act: delete the assignment", () => api.rest.pricing.assignments.delete([assignment.id]));

    await test.step("assert: the assignment is not found", async () => {
      expect(await api.rest.pricing.assignments.find(assignment.id)).toBeUndefined();
    });
  });

  test("delete the assignments matching a search", async ({ api, arrange }) => {
    await allure.story("Delete");
    await allure.description("Deleting the assignments that match a name and a pricelist removes the assignment.");
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());
    const assignment = await test.step("arrange: its assignment", () =>
      arrange.pricing.pricelistAssignment(pricelist.id));

    await test.step("act: delete the assignments matching its name and pricelist", () =>
      api.rest.pricing.assignments.deleteMatching({ keyword: assignment.name, priceListId: pricelist.id }));

    await test.step("assert: the assignment is not found", async () => {
      expect(await api.rest.pricing.assignments.find(assignment.id)).toBeUndefined();
    });
  });
});
