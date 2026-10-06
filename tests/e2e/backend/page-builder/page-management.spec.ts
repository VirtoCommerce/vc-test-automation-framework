import * as allure from "allure-js-commons";

import { expect, test } from "@fixtures";
import { Column, DetailsToolbar, Route, Status } from "@pages/backend/page-builder/constants";
import { expectToolbarButtonEnabled } from "@pages/backend/shell/blade-toolbar";

import { arrangeDraftPage, DEFAULT_LANGUAGE, uiPageName } from "./page-builder-support";

const DESIGNER_APP = "page-builder-designer";

test.beforeEach(async () => {
  await allure.feature("Page Builder Shell / Page management (E2E)");
});

test.describe("page management (platform admin)", () => {
  test("create a draft page", async ({ pageBuilder, pageBuilderClient, cleanupStack, env }) => {
    const name = uiPageName(pageBuilderClient, cleanupStack, env.storeId);

    await test.step(`act: create ${name} from the draft list`, async () => {
      await pageBuilder.open(Route.draft);
      const details = await pageBuilder.addPage();
      await details.fill({ name, permalink: `/${name}` });
      await details.language.select(DEFAULT_LANGUAGE);
      await pageBuilder.saveDetails();
    });

    await test.step("assert: the draft list shows the page with the entered values", async () => {
      const listing = await pageBuilder.expectListed(Route.draft, name);
      const row = listing.pageRow(name);
      expect(await row.value(Column.permalink)).toBe(`/${name}`);
      expect(await row.value(Column.language)).toBe(DEFAULT_LANGUAGE);
      expect(await row.badges(Column.status)).toEqual([Status.draft]);
    });

    await test.step("assert: the draft counter matches the draft list", async () => {
      await pageBuilder.expectCounterMatchesList(Route.draft);
    });
  });

  test("rename a page and change its permalink", async ({ pageBuilder, pageBuilderClient, cleanupStack, env }) => {
    const page = await arrangeDraftPage(pageBuilderClient, cleanupStack, env.storeId);
    const renamed = `${page.name}-edited`;

    const modifiedBefore = await test.step(`arrange: open ${page.name}`, async () => {
      await pageBuilder.open(Route.draft);
      await pageBuilder.openPage(page.name);
      return pageBuilder.listBlade.pageRow(page.name).value(Column.modified);
    });

    await test.step(`act: rename to ${renamed} and save`, async () => {
      await pageBuilder.detailsBlade.fill({ name: renamed, permalink: `/${renamed}` });
      await pageBuilder.saveDetails();
    });

    await test.step("assert: the blade keeps the new values", async () => {
      await expect(pageBuilder.detailsBlade.nameInput).toHaveValue(renamed);
      await expect(pageBuilder.detailsBlade.permalinkInput).toHaveValue(`/${renamed}`);
    });

    await test.step("assert: the list shows only the new name with a fresh modified date", async () => {
      await pageBuilder.expectListed(Route.draft, page.name, false);
      const row = (await pageBuilder.expectListed(Route.draft, renamed)).pageRow(renamed);
      expect(await row.value(Column.permalink)).toBe(`/${renamed}`);
      expect(await row.value(Column.modified)).not.toBe(modifiedBefore);
    });
  });

  test("open a page in the designer", async ({ pageBuilder, pageBuilderClient, cleanupStack, env }) => {
    const page = await arrangeDraftPage(pageBuilderClient, cleanupStack, env.storeId);

    const designerButton = await test.step(`arrange: open ${page.name} with the designer enabled`, async () => {
      await pageBuilder.open(Route.draft);
      const button = (await pageBuilder.openPage(page.name)).toolbar.button(DetailsToolbar.openDesigner);
      await expectToolbarButtonEnabled(button);
      return button;
    });

    const designer = await test.step("act: open the designer", async () => {
      const [popup] = await Promise.all([pageBuilder.page.context().waitForEvent("page"), designerButton.click()]);
      await popup.waitForLoadState("domcontentloaded");
      return popup;
    });

    await test.step("assert: the designer app opened in a new tab", async () => {
      expect(designer.url()).toContain(DESIGNER_APP);
      await designer.close();
    });
  });

  test("archive a draft page", async ({ pageBuilder, pageBuilderClient, cleanupStack, env }) => {
    const page = await arrangeDraftPage(pageBuilderClient, cleanupStack, env.storeId);

    await test.step(`arrange: open ${page.name}`, async () => {
      await pageBuilder.open(Route.draft);
      await pageBuilder.openPage(page.name);
    });

    await test.step("act: archive the page and confirm", async () => {
      await pageBuilder.detailsBlade.toolbar.click(DetailsToolbar.archive);
      await expect(pageBuilder.popup.content).toContainText("archive");
      await pageBuilder.popup.confirm();
    });

    await test.step("assert: the page left the draft list for the archived list", async () => {
      await pageBuilder.expectListed(Route.draft, page.name, false);
      const row = (await pageBuilder.expectListed(Route.archived, page.name)).pageRow(page.name);
      expect(await row.badges(Column.status)).toEqual([Status.archived]);
    });
  });
});
