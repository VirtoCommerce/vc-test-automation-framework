import * as allure from "allure-js-commons";

import { uniqueId } from "@core/unique-id";
import { TEST_PAGE_PREFIX } from "@dataset/builders/page-builder";
import { expect, test } from "@fixtures";
import { Column, DetailsToolbar, Route } from "@pages/backend/page-builder/page-builder";
import { DISABLED_TOOLBAR_BUTTON } from "@pages/backend/shell/controls";

const DESIGNER_APP = "page-builder-designer";

test.beforeEach(async () => {
  await allure.epic("E2E");
  await allure.feature("Admin / Page builder");
});

test.describe("page management (platform admin)", () => {
  test("create a draft page", async ({ pageBuilder, arrange, store }) => {
    await allure.story("Pages");
    await allure.description(
      "A page created in the draft list is listed with its permalink, language and Draft status, and the draft " +
        "counter matches the list.",
    );
    const name = uniqueId(TEST_PAGE_PREFIX);
    arrange.content.deletePagesLater(name);
    const row = pageBuilder.listBlade.pageRow(name);

    await test.step(`act: create ${name}`, async () => {
      const details = await pageBuilder.addPage();
      await details.fill({ name, permalink: `/${name}` });
      await details.language.select(store.defaultLanguage);
      await details.save();
    });

    await test.step("assert: the draft list shows the page with its values", async () => {
      expect(await pageBuilder.isListed(Route.draft, name)).toBe(true);
      await expect(row.cell(Column.permalink)).toHaveText(`/${name}`);
      await expect(row.cell(Column.language)).toHaveText(store.defaultLanguage);
      await expect(row.cell(Column.status)).toHaveText("Draft");
    });
    await test.step("assert: the draft counter matches the draft list", async () => {
      const { counter, listed } = await pageBuilder.counts(Route.draft);
      expect(counter).toBe(listed);
    });
  });

  test("rename a page and change its permalink", async ({ pageBuilder, arrange }) => {
    await allure.story("Pages");
    await allure.description(
      "A renamed page with a new permalink is listed under its new values with a new modified date.",
    );
    const draft = await test.step("arrange: a draft page", () => arrange.content.page());
    const renamed = `${draft.name}-edited`;
    const listing = pageBuilder.listBlade;

    const modifiedBefore = await test.step(`arrange: open ${draft.name}`, async () => {
      await pageBuilder.openPage(draft.name, Route.draft);
      return listing.pageRow(draft.name).value(Column.modified);
    });

    await test.step(`act: rename the page to ${renamed} and save`, async () => {
      await pageBuilder.detailsBlade.fill({ name: renamed, permalink: `/${renamed}` });
      await pageBuilder.detailsBlade.save();
    });

    await test.step("assert: the list shows only the new name, its permalink and a new modified date", async () => {
      expect(await pageBuilder.isListed(Route.draft, draft.name)).toBe(false);
      expect(await pageBuilder.isListed(Route.draft, renamed)).toBe(true);
      await expect(listing.pageRow(renamed).cell(Column.permalink)).toHaveText(`/${renamed}`);
      await expect(listing.pageRow(renamed).cell(Column.modified)).not.toHaveText(modifiedBefore);
    });
  });

  test("open a page in the designer", async ({ pageBuilder, arrange }) => {
    await allure.story("Pages");
    await allure.description("Opening a page in the designer opens the designer app in a new tab.");
    const draft = await test.step("arrange: a draft page", () => arrange.content.page());
    const designerButton = pageBuilder.detailsBlade.toolbarButton(DetailsToolbar.openDesigner);

    await test.step(`arrange: open ${draft.name}`, async () => {
      await pageBuilder.openPage(draft.name, Route.draft);
      await expect(designerButton).not.toHaveClass(DISABLED_TOOLBAR_BUTTON);
    });

    const designer = await test.step("act: open the designer", async () => {
      const [tab] = await Promise.all([pageBuilder.page.context().waitForEvent("page"), designerButton.click()]);
      await tab.waitForLoadState("domcontentloaded");
      return tab;
    });

    await test.step("assert: the designer app opened in a new tab", async () => {
      expect(designer.url()).toContain(DESIGNER_APP);
      await designer.close();
    });
  });

  test("archive a draft page", async ({ pageBuilder, arrange }) => {
    await allure.story("Pages");
    await allure.description("An archived draft leaves the draft list and is listed as Archived.");
    const draft = await test.step("arrange: a draft page", () => arrange.content.page());

    await test.step(`act: archive ${draft.name}`, async () => {
      await (await pageBuilder.openPage(draft.name, Route.draft)).archive();
    });

    await test.step("assert: the page moved from the draft list to the archived list", async () => {
      expect(await pageBuilder.isListed(Route.draft, draft.name)).toBe(false);
      expect(await pageBuilder.isListed(Route.archived, draft.name)).toBe(true);
      await expect(pageBuilder.listBlade.pageRow(draft.name).cell(Column.status)).toHaveText("Archived");
    });
  });
});
