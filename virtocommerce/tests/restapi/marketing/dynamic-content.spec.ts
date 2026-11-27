import type { DynamicContentKind } from "@builders/marketing.ts";
import type { VirtoCommerceMarketingModuleCoreModelDynamicContentPublication as Publication } from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { ageConditionTree, newDynamicContent } from "@builders/marketing.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";

interface NamedEntity {
  readonly id?: string | null;
  readonly name?: string | null;
}

const PATHS: Readonly<Record<DynamicContentKind, string>> = {
  folders: "/api/marketing/contentfolders",
  items: "/api/marketing/contentitems",
  places: "/api/marketing/contentplaces",
  publications: "/api/marketing/contentpublications",
};
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

test.describe("dynamic content (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  for (const { kind, record } of CONTENT_KINDS) {
    test(`create a ${record}`, async ({ api, arrange }) => {
      const draft = newDynamicContent(kind);
      arrange.marketing.deleteDynamicContentLater(kind, draft.id);

      const created = await test.step(`act: create a ${record}`, async () =>
        (await api.post(PATHS[kind], { json: draft })).expectOk().json<NamedEntity>());

      await test.step(`assert: the ${record} has its name`, () => {
        expect(created.name).toBe(draft.name);
      });
    });

    test(`get a ${record} by id`, async ({ api, arrange }) => {
      const created = await test.step(`arrange: a ${record}`, () => arrange.marketing.dynamicContent(kind));

      const reloaded = await test.step(`act: get the ${record}`, () => entityOf(api, kind, created.id));

      await test.step("assert: the fields match the created record", () => {
        expect(reloaded).toMatchObject({ id: created.id, name: created.name });
      });
    });

    test(`rename a ${record}`, async ({ api, arrange }) => {
      const created = await test.step(`arrange: a ${record}`, () => arrange.marketing.dynamicContent(kind));
      const newName = `${created.name}-renamed`;

      await test.step(`act: rename the ${record}`, async () =>
        (await api.put(PATHS[kind], { json: { ...created, name: newName } })).expectOk());

      await test.step(`assert: the ${record} has the new name`, async () => {
        await expect
          .poll(async () => (await entityOf(api, kind, created.id))?.name, { timeout: READ_AFTER_WRITE_TIMEOUT_MS })
          .toBe(newName);
      });
    });

    test(`delete ${record}s in bulk`, async ({ api, arrange }) => {
      const ids = await test.step(`arrange: two ${record}s`, async () => [
        (await arrange.marketing.dynamicContent(kind)).id,
        (await arrange.marketing.dynamicContent(kind)).id,
      ]);

      await test.step(`act: delete both ${record}s in one request`, async () =>
        (await api.delete(PATHS[kind], { query: { ids } })).expectOk());

      await test.step(`assert: neither ${record} is found`, async () => {
        await expect
          .poll(() => Promise.all(ids.map((id) => entityOf(api, kind, id))), { timeout: READ_AFTER_WRITE_TIMEOUT_MS })
          .toEqual([undefined, undefined]);
      });
    });
  }

  for (const { kind, record } of SEARCHABLE_KINDS) {
    test(`search ${record}s by keyword`, async ({ api, arrange }) => {
      const created = await test.step(`arrange: a ${record}`, () => arrange.marketing.dynamicContent(kind));

      const found = await test.step(`act: search ${record}s by its name`, async () =>
        (await api.post(`${PATHS[kind]}/search`, { json: { keyword: created.name } }))
          .expectOk()
          .json<{ results?: NamedEntity[] | null }>().results ?? []);

      await test.step(`assert: the ${record} is found`, () => {
        expect(found.map(({ id }) => id)).toContain(created.id);
      });
    });
  }

  test("get a new content publication template", async ({ api }) => {
    const template = await test.step("act: get a new publication template", async () =>
      (await api.get(`${PATHS.publications}/new`)).expectOk().json<Publication>());

    await test.step("assert: the template has no id and a DynamicContentConditionTree", () => {
      expect(template.id ?? undefined).toBeUndefined();
      expect(template.dynamicExpression).toMatchObject({ id: "DynamicContentConditionTree" });
    });
  });

  test("add and change the condition of a content publication", async ({ api, arrange }) => {
    const publication = await test.step("arrange: an inactive publication", () =>
      arrange.marketing.dynamicContent("publications"));

    await test.step("act: add an age condition of 21", async () =>
      (
        await api.put(PATHS.publications, { json: { ...publication, dynamicExpression: ageConditionTree(21) } })
      ).expectOk());
    await test.step("assert: the condition is saved", async () => {
      await expect
        .poll(async () => (await publicationOf(api, publication.id))?.dynamicExpression, {
          timeout: READ_AFTER_WRITE_TIMEOUT_MS,
        })
        .toMatchObject({
          children: [{ id: "BlockContentCondition", children: [{ id: "ConditionAgeIs", value: 21 }] }],
        });
    });

    await test.step("act: change the age condition to 31", async () => {
      const saved = await publicationOf(api, publication.id);
      (await api.put(PATHS.publications, { json: { ...saved, dynamicExpression: ageConditionTree(31) } })).expectOk();
    });
    await test.step("assert: the condition has the new age", async () => {
      await expect
        .poll(async () => (await publicationOf(api, publication.id))?.dynamicExpression, {
          timeout: READ_AFTER_WRITE_TIMEOUT_MS,
        })
        .toMatchObject({ children: [{ children: [{ id: "ConditionAgeIs", value: 31 }] }] });
    });
  });
});

async function entityOf(api: HttpClient, kind: DynamicContentKind, id: string): Promise<NamedEntity | undefined> {
  return (await api.get(`${PATHS[kind]}/${id}`)).optionalJson<NamedEntity>({ allow404: true });
}

async function publicationOf(api: HttpClient, id: string): Promise<Publication | undefined> {
  return (await entityOf(api, "publications", id)) as Publication | undefined;
}
