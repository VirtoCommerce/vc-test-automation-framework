import * as allure from "allure-js-commons";

import { uniqueId } from "@core/unique-id";
import { MODULES } from "@dataset/modules";
import { expect, test } from "@fixtures";
import { Route } from "@pages/backend/page-builder/page-builder";
import { DISABLED_TOOLBAR_BUTTON } from "@pages/backend/shell/controls";

const SEARCH_MARKER = "searchable";
const NO_MATCH = "&";
const NEW_PAGE_FIELDS = [
  { fields: { name: "", permalink: "" }, missing: "a name and a permalink" },
  { fields: { name: "qa-missing-permalink", permalink: "" }, missing: "a permalink" },
  { fields: { name: "", permalink: "/qa-missing-name" }, missing: "a name" },
] as const;
const COMPLETE_FIELDS = { name: "qa-both-fields", permalink: "/qa-both-fields" } as const;

test.beforeEach(async () => {
  await allure.epic("E2E");
  await allure.feature("Admin / Page builder");
});

test.describe("page search (platform admin)", () => {
  test.use({ requiresModules: [MODULES.pageBuilder] });

  test("search matches part of the name and ignores case", async ({ pageBuilder, arrange }) => {
    await allure.story("Search");
    await allure.description(
      `Searching "${SEARCH_MARKER}" in any case finds a page by part of its name, "${NO_MATCH}" excludes it ` +
        "without an error, and clearing the search lists it again.",
    );
    const draft = await test.step("arrange: a draft page with a marker in its name", () =>
      arrange.content.page({ name: uniqueId(`qa-${SEARCH_MARKER}`) }));
    const listing = pageBuilder.listBlade;
    const rows = listing.pageRows(draft.name);
    await test.step("arrange: open every page", () => pageBuilder.open(Route.all));

    for (const term of [SEARCH_MARKER, SEARCH_MARKER.toUpperCase()]) {
      await test.step(`act: search "${term}"`, () => listing.search(term));
      await test.step(`assert: ${draft.name} is found`, async () => {
        await expect(rows).toHaveCount(1);
      });
    }

    await test.step(`act: search "${NO_MATCH}"`, () => listing.search(NO_MATCH));
    await test.step(`assert: ${draft.name} is excluded without an error`, async () => {
      await expect(rows).toHaveCount(0);
      await expect(pageBuilder.notifications.error).toHaveCount(0);
    });

    await test.step("act: clear the search", () => listing.search(""));
    await test.step(`assert: ${draft.name} is listed again`, async () => {
      expect(await listing.reveal(draft.name)).toBe(true);
    });
  });
});

test.describe("page validation (platform admin)", () => {
  test.use({ requiresModules: [MODULES.pageBuilder] });

  for (const { fields, missing } of NEW_PAGE_FIELDS) {
    test(`Save is disabled for a new page without ${missing}`, async ({ pageBuilder }) => {
      await allure.story("Validation");
      await allure.description(`A new page without ${missing} cannot be saved.`);
      const details = await test.step("arrange: start a new page", () => pageBuilder.addPage());

      await test.step(`act: fill ${JSON.stringify(fields)}`, () => details.fill(fields));

      await test.step("assert: Save is disabled", async () => {
        await expect(details.saveButton).toHaveClass(DISABLED_TOOLBAR_BUTTON);
      });
    });
  }

  test("Save is enabled for a new page with a name and a permalink", async ({ pageBuilder }) => {
    await allure.story("Validation");
    await allure.description("A new page with a name and a permalink can be saved.");
    const details = await test.step("arrange: start a new page", () => pageBuilder.addPage());

    await test.step(`act: fill ${JSON.stringify(COMPLETE_FIELDS)}`, () => details.fill(COMPLETE_FIELDS));

    await test.step("assert: Save is enabled", async () => {
      await expect(details.saveButton).not.toHaveClass(DISABLED_TOOLBAR_BUTTON);
    });
  });
});
