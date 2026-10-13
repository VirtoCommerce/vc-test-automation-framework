import * as allure from "allure-js-commons";

import { ageConditionTree, newDynamicContent } from "@dataset/builders/marketing";
import { expect, test } from "@fixtures";

const CONTENT_KINDS = [
  { kind: "folders", record: "content folder" },
  { kind: "items", record: "content item" },
  { kind: "places", record: "content place" },
  { kind: "publications", record: "content publication" },
] as const;
const SEARCHABLE_KINDS = [
  { kind: "items", record: "content item" },
  { kind: "places", record: "content place" },
  { kind: "publications", record: "content publication" },
] as const;
const READ_AFTER_WRITE_TIMEOUT_MS = 5_000;

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Marketing / Dynamic Content");
});

test.describe("dynamic content (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  for (const { kind, record } of CONTENT_KINDS) {
    test(`create a ${record}`, async ({ api, cleanup }) => {
      await allure.story("Create");
      await allure.description(`A new ${record} has its name.`);
      const draft = newDynamicContent(kind);
      cleanup.push(`delete ${record} ${draft.name}`, () => api.rest.dynamicContent[kind].delete([draft.id]));

      const created = await test.step(`act: create a ${record}`, () => api.rest.dynamicContent[kind].create(draft));

      await test.step(`assert: the ${record} has its name`, () => {
        expect(created.name).toBe(draft.name);
      });
    });

    test(`get a ${record} by id`, async ({ api, arrange }) => {
      await allure.story("Read");
      await allure.description(`A ${record} is read back by its id with the name it was created with.`);
      const created = await test.step(`arrange: a ${record}`, () => arrange.marketing.dynamicContent(kind));

      const reloaded = await test.step(`act: get the ${record}`, () => api.rest.dynamicContent[kind].get(created.id));

      await test.step("assert: the fields match the created record", () => {
        expect(reloaded).toMatchObject({ id: created.id, name: created.name });
      });
    });

    test(`rename a ${record}`, async ({ api, arrange }) => {
      await allure.story("Update");
      await allure.description(`A renamed ${record} is read back with its new name.`);
      const created = await test.step(`arrange: a ${record}`, () => arrange.marketing.dynamicContent(kind));
      const newName = `${created.name}-renamed`;

      await test.step(`act: rename the ${record}`, () =>
        api.rest.dynamicContent[kind].update({ ...created, name: newName }));

      await test.step(`assert: the ${record} has the new name`, async () => {
        await expect
          .poll(async () => (await api.rest.dynamicContent[kind].get(created.id)).name, {
            timeout: READ_AFTER_WRITE_TIMEOUT_MS,
          })
          .toBe(newName);
      });
    });

    test(`delete ${record}s in bulk`, async ({ api, arrange }) => {
      await allure.story("Delete");
      await allure.description(`Two ${record}s deleted in one request are both gone.`);
      const ids = await test.step(`arrange: two ${record}s`, async () => [
        (await arrange.marketing.dynamicContent(kind)).id,
        (await arrange.marketing.dynamicContent(kind)).id,
      ]);

      await test.step(`act: delete both ${record}s in one request`, () => api.rest.dynamicContent[kind].delete(ids));

      await test.step(`assert: neither ${record} is found`, async () => {
        await expect
          .poll(() => Promise.all(ids.map((id) => api.rest.dynamicContent[kind].find(id))), {
            timeout: READ_AFTER_WRITE_TIMEOUT_MS,
          })
          .toEqual([undefined, undefined]);
      });
    });
  }

  for (const { kind, record } of SEARCHABLE_KINDS) {
    test(`search ${record}s by keyword`, async ({ api, arrange }) => {
      await allure.story("Search");
      await allure.description(`Searching ${record}s by a record's name finds it.`);
      const created = await test.step(`arrange: a ${record}`, () => arrange.marketing.dynamicContent(kind));

      const found = await test.step(`act: search ${record}s by its name`, () =>
        api.rest.dynamicContent[kind].search({ keyword: created.name }));

      await test.step(`assert: the ${record} is found`, () => {
        expect(found.map(({ id }) => id)).toContain(created.id);
      });
    });
  }

  test("get a new content publication template", async ({ api }) => {
    await allure.story("Publications");
    await allure.description("The template of a new publication is unsaved and has a condition tree.");

    const template = await test.step("act: get a new publication template", () =>
      api.rest.dynamicContent.publications.template());

    await test.step("assert: the template has no id and a DynamicContentConditionTree", () => {
      expect(template.id ?? undefined).toBeUndefined();
      expect(template.dynamicExpression).toMatchObject({ id: "DynamicContentConditionTree" });
    });
  });

  test("add and change the condition of a content publication", async ({ api, arrange }) => {
    await allure.story("Publications");
    await allure.description("A publication's age condition is saved, and a changed age replaces it.");
    const { publications } = api.rest.dynamicContent;
    const publication = await test.step("arrange: an inactive publication", () =>
      arrange.marketing.dynamicContent("publications"));

    await test.step("act: add an age condition of 21", () =>
      publications.update({ ...publication, dynamicExpression: ageConditionTree(21) }));
    await test.step("assert: the condition is saved", async () => {
      await expect
        .poll(async () => (await publications.get(publication.id)).dynamicExpression, {
          timeout: READ_AFTER_WRITE_TIMEOUT_MS,
        })
        .toMatchObject({
          children: [{ id: "BlockContentCondition", children: [{ id: "ConditionAgeIs", value: 21 }] }],
        });
    });

    await test.step("act: change the age condition to 31", async () =>
      publications.update({ ...(await publications.get(publication.id)), dynamicExpression: ageConditionTree(31) }));
    await test.step("assert: the condition has the new age", async () => {
      await expect
        .poll(async () => (await publications.get(publication.id)).dynamicExpression, {
          timeout: READ_AFTER_WRITE_TIMEOUT_MS,
        })
        .toMatchObject({ children: [{ children: [{ id: "ConditionAgeIs", value: 31 }] }] });
    });
  });
});
