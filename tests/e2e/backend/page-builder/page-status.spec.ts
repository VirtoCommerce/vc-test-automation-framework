import type { PageBuilderRoute } from "@pages/backend/page-builder/constants";
import type { PageBuilderShell } from "@pages/backend/page-builder/page-builder-shell";

import * as allure from "allure-js-commons";

import { daysFromNow } from "@core/dates";
import { describeIssue, KNOWN_ISSUES } from "@dataset/known-issues";
import { expect, test } from "@fixtures";
import { ALL_COLUMNS, Column, DetailsToolbar, Route, Status } from "@pages/backend/page-builder/constants";
import { expectToolbarButtonDisabled, expectToolbarButtonEnabled } from "@pages/backend/shell/blade-toolbar";

import { arrangeDraftPage } from "./page-builder-support";

const SAVE_TOAST = "Page saved successfully";
const TOAST_DISMISS_TIMEOUT_MS = 15_000;

const PUBLISHING_PATH = "/api/page-builder-pages/grouped/publishing/";

test.beforeEach(async () => {
  await allure.feature("Page Builder Shell / Page status (E2E)");
});

test.describe("status filters (platform admin)", () => {
  test("the draft filter lists only drafts and its counter matches", async ({
    pageBuilder,
    pageBuilderClient,
    cleanupStack,
    env,
  }) => {
    await arrangeDraftPage(pageBuilderClient, cleanupStack, env.storeId);

    await test.step("act: open the draft list", () => pageBuilder.open(Route.draft));

    await test.step("assert: the grid has every column and only draft badges", async () => {
      for (const column of ALL_COLUMNS) {
        await expect(pageBuilder.listBlade.grid.columnHeader(column)).toBeVisible();
      }
      await expectOnlyStatus(pageBuilder, Status.draft);
    });
    await expectCounterMatchesList(pageBuilder, Route.draft);
  });

  test("the active filter lists only published pages and its counter matches", async ({
    pageBuilder,
    pageBuilderClient,
    cleanupStack,
    env,
  }) => {
    const page = await arrangeDraftPage(pageBuilderClient, cleanupStack, env.storeId);
    await test.step(`arrange: publish ${page.name}`, () => pageBuilderClient.setStatus(page.id, "Published"));

    await test.step("act: open the active list", () => pageBuilder.open(Route.active));

    await test.step("assert: only published badges are listed", () => expectOnlyStatus(pageBuilder, Status.published));
    await expectCounterMatchesList(pageBuilder, Route.active);
  });

  test("the pending filter lists published pages with a future start date", async ({
    pageBuilder,
    pageBuilderClient,
    cleanupStack,
    env,
  }) => {
    const page = await arrangeDraftPage(pageBuilderClient, cleanupStack, env.storeId);

    await test.step("arrange: schedule the page to start in a week and publish it", async () => {
      const details = await test.step(`arrange: open ${page.name}`, () => pageBuilder.openPage(page.name, Route.draft));
      await details.schedulingSection.expand();
      await details.startDate.select(daysFromNow(7));
      await pageBuilder.saveDetails();
      await expectToolbarButtonEnabled(details.toolbar.button(DetailsToolbar.publish));
      await details.toolbar.click(DetailsToolbar.publish);
    });

    const listing = await test.step("act: open the pending list", () =>
      pageBuilder.expectListed(Route.pending, page.name));

    await test.step("assert: the page is published and scheduled, and pending lists only published pages", async () => {
      expect(await listing.pageRow(page.name).badges(Column.status)).toEqual(
        expect.arrayContaining([Status.published, Status.scheduled]),
      );
      await expectOnlyStatus(pageBuilder, Status.published);
    });
  });

  test("the archived filter lists only archived pages", async ({
    pageBuilder,
    pageBuilderClient,
    cleanupStack,
    env,
  }) => {
    const page = await arrangeDraftPage(pageBuilderClient, cleanupStack, env.storeId);
    await test.step(`arrange: archive ${page.name}`, async () => {
      await (await pageBuilder.openPage(page.name, Route.draft)).archive();
    });

    const listing = await test.step("act: open the archived list", () =>
      pageBuilder.expectListed(Route.archived, page.name));

    await test.step("assert: the page and every other row are archived", async () => {
      expect(await listing.pageRow(page.name).badges(Column.status)).toEqual([Status.archived]);
      await expectOnlyStatus(pageBuilder, Status.archived);
    });
  });
});

test.describe("status transitions (platform admin)", () => {
  test("publishing a draft moves it to the active list", async ({
    pageBuilder,
    pageBuilderClient,
    cleanupStack,
    env,
  }) => {
    const page = await arrangeDraftPage(pageBuilderClient, cleanupStack, env.storeId);

    await test.step("act: publish the draft", () => publish(pageBuilder, page.name));

    await test.step("assert: the page left the draft list", async () => {
      await pageBuilder.expectListed(Route.draft, page.name, false);
    });
    await test.step("assert: the page is listed as published", async () => {
      const row = (await pageBuilder.expectListed(Route.active, page.name)).pageRow(page.name);
      expect(await row.badges(Column.status)).toEqual([Status.published]);
    });
    await expectCounterMatchesList(pageBuilder, Route.draft);
    await expectCounterMatchesList(pageBuilder, Route.active);
  });

  test("a published page can be archived", async ({ pageBuilder, pageBuilderClient, cleanupStack, env }) => {
    const page = await arrangeDraftPage(pageBuilderClient, cleanupStack, env.storeId);
    await test.step(`arrange: publish ${page.name}`, () => pageBuilderClient.setStatus(page.id, "Published"));

    await test.step("act: archive the published page", async () => {
      await (await pageBuilder.openPage(page.name, Route.active)).archive();
    });

    await test.step("assert: the page left the active list for the archived list", async () => {
      await pageBuilder.expectListed(Route.active, page.name, false);
      const row = (await pageBuilder.expectListed(Route.archived, page.name)).pageRow(page.name);
      expect(await row.badges(Column.status)).toEqual([Status.archived]);
    });
  });

  test("unpublishing returns a page to the draft list", async ({
    pageBuilder,
    pageBuilderClient,
    cleanupStack,
    env,
  }) => {
    const page = await arrangeDraftPage(pageBuilderClient, cleanupStack, env.storeId);
    await test.step(`arrange: publish ${page.name}`, () => pageBuilderClient.setStatus(page.id, "Published"));

    await test.step("act: unpublish the page", async () => {
      const details = await pageBuilder.openPage(page.name, Route.active);
      await expectToolbarButtonEnabled(details.toolbar.button(DetailsToolbar.unpublish));
      await details.toolbar.click(DetailsToolbar.unpublish);
    });

    await test.step("assert: the page is a draft again and can be republished", async () => {
      await pageBuilder.expectListed(Route.active, page.name, false);
      const row = (await pageBuilder.expectListed(Route.draft, page.name)).pageRow(page.name);
      expect(await row.badges(Column.status)).toEqual([Status.draft]);
      const details = await pageBuilder.openPage(page.name);
      await expectToolbarButtonEnabled(details.toolbar.button(DetailsToolbar.publish));
    });
  });
});

test.describe("user feedback (platform admin)", () => {
  test("saving a page shows a success toast and disables Save again", async ({
    pageBuilder,
    pageBuilderClient,
    cleanupStack,
    env,
  }) => {
    const page = await arrangeDraftPage(pageBuilderClient, cleanupStack, env.storeId);
    const details = await test.step(`arrange: open ${page.name}`, () => pageBuilder.openPage(page.name, Route.draft));

    await test.step("assert: Save is disabled until a field changes", async () => {
      await expectToolbarButtonDisabled(details.saveButton);
      await details.fill({ name: `${page.name}-toast` });
      await expectToolbarButtonEnabled(details.saveButton);
    });

    await test.step("act: save", () => details.saveButton.click());

    await test.step(`assert: "${SAVE_TOAST}" appears, Save is disabled and the toast goes away`, async () => {
      await expect(pageBuilder.notifications.successWith(SAVE_TOAST)).toBeVisible();
      await expectToolbarButtonDisabled(details.saveButton);
      await expect(pageBuilder.notifications.all).toHaveCount(0, { timeout: TOAST_DISMISS_TIMEOUT_MS });
    });
  });

  test("publishing a page shows a success toast", async ({ pageBuilder, pageBuilderClient, cleanupStack, env }) => {
    test.fail(true, describeIssue(KNOWN_ISSUES.pageStatusToast));
    const page = await arrangeDraftPage(pageBuilderClient, cleanupStack, env.storeId);

    await test.step("act: publish the draft", () => publish(pageBuilder, page.name));

    await test.step("assert: a published toast appears", async () => {
      await expect(pageBuilder.notifications.successWith("published")).toBeVisible();
    });
  });

  test("unpublishing a page shows a success toast", async ({ pageBuilder, pageBuilderClient, cleanupStack, env }) => {
    test.fail(true, describeIssue(KNOWN_ISSUES.pageStatusToast));
    const page = await arrangeDraftPage(pageBuilderClient, cleanupStack, env.storeId);
    await test.step(`arrange: publish ${page.name}`, () => pageBuilderClient.setStatus(page.id, "Published"));

    await test.step("act: unpublish the page", async () => {
      await (await pageBuilder.openPage(page.name, Route.active)).toolbar.click(DetailsToolbar.unpublish);
    });

    await test.step("assert: an unpublished toast appears", async () => {
      await expect(pageBuilder.notifications.successWith("unpublished")).toBeVisible();
    });
  });
});

async function publish(pageBuilder: PageBuilderShell, name: string): Promise<void> {
  const details = await pageBuilder.openPage(name, Route.draft);
  await expectToolbarButtonEnabled(details.toolbar.button(DetailsToolbar.publish));
  await Promise.all([
    pageBuilder.page.waitForResponse((response) => response.url().includes(PUBLISHING_PATH) && response.ok()),
    details.toolbar.click(DetailsToolbar.publish),
  ]);
}

async function expectOnlyStatus(pageBuilder: PageBuilderShell, status: string): Promise<void> {
  const statuses = await pageBuilder.listBlade.statuses();
  expect(statuses.length).toBeGreaterThan(0);
  expect(statuses.filter((value) => !value.includes(status))).toEqual([]);
}

async function expectCounterMatchesList(pageBuilder: PageBuilderShell, route: PageBuilderRoute): Promise<void> {
  await test.step(`assert: the ${route} counter matches the list total`, async () => {
    await pageBuilder.expectCounterMatchesList(route);
  });
}
