import type { Arrange } from "@dataset/arrange";

import * as allure from "allure-js-commons";

import { MODULES } from "@dataset/modules";
import { expect, test } from "@fixtures";
import { Column, Route } from "@pages/backend/page-builder/page-builder";
import { DISABLED_TOOLBAR_BUTTON } from "@pages/backend/shell/controls";

const DAY_MS = 86_400_000;
const PENDING_IN_DAYS = 7;
const SAVE_TOAST = "Page saved successfully";
const TOAST_DISMISS_TIMEOUT_MS = 15_000;
const STATUS_LISTS = [
  { route: Route.draft, status: "Draft", page: "a draft page", create: (arrange: Arrange) => arrange.content.page() },
  {
    route: Route.active,
    status: "Published",
    page: "a published page",
    create: (arrange: Arrange) => arrange.content.publishedPage(),
  },
] as const;

test.beforeEach(async () => {
  await allure.epic("E2E");
  await allure.feature("Admin / Page builder");
});

test.describe("status filters (platform admin)", () => {
  test.use({ requiresModules: [MODULES.pageBuilder] });

  for (const { route, status, page, create } of STATUS_LISTS) {
    test(`the ${route} list shows only ${status} pages and its counter matches`, async ({ pageBuilder, arrange }) => {
      await allure.story("Status lists");
      await allure.description(`The ${route} list shows only ${status} pages, as many as its menu counter says.`);
      await test.step(`arrange: ${page}`, () => create(arrange));

      const { counter, listed } = await test.step(`act: open the ${route} list`, () => pageBuilder.counts(route));

      await test.step(`assert: every row is ${status} and the counter is ${listed}`, async () => {
        const statuses = await pageBuilder.listBlade.grid.values(Column.status);
        expect(statuses.length).toBeGreaterThan(0);
        for (const value of statuses) {
          expect(value).toContain(status);
        }
        expect(counter).toBe(listed);
      });
    });
  }

  test("the pending list shows published pages with a future start date", async ({ pageBuilder, arrange }) => {
    await allure.story("Status lists");
    await allure.description(
      `A page published with a start date ${PENDING_IN_DAYS} days ahead is pending, as Published and Scheduled.`,
    );
    const draft = await test.step("arrange: a draft page", () => arrange.content.page());
    await test.step(`arrange: start the page in ${PENDING_IN_DAYS} days and publish it`, async () => {
      const details = await pageBuilder.openPage(draft.name, Route.draft);
      await details.schedulingSection.expand();
      await details.startDate.select(new Date(Date.now() + PENDING_IN_DAYS * DAY_MS));
      await details.save();
      await details.publish();
    });

    const listed = await test.step("act: open the pending list", () => pageBuilder.isListed(Route.pending, draft.name));

    await test.step("assert: the page is pending as Published and Scheduled", async () => {
      expect(listed).toBe(true);
      const status = pageBuilder.listBlade.pageRow(draft.name).cell(Column.status);
      await expect(status).toContainText("Published");
      await expect(status).toContainText("Scheduled");
    });
  });

  test("the archived list shows only archived pages", async ({ pageBuilder, arrange }) => {
    await allure.story("Status lists");
    await allure.description("An archived page is in the archived list, where every row is Archived.");
    const draft = await test.step("arrange: an archived page", async () => {
      const created = await arrange.content.page();
      await arrange.admin.rest.pageBuilder.pages.setStatus(created.id, "Archived");
      return created;
    });

    const listed = await test.step("act: open the archived list", () =>
      pageBuilder.isListed(Route.archived, draft.name));

    await test.step("assert: the page and every other row are Archived", async () => {
      expect(listed).toBe(true);
      for (const value of await pageBuilder.listBlade.grid.values(Column.status)) {
        expect(value).toContain("Archived");
      }
    });
  });
});

test.describe("status transitions (platform admin)", () => {
  test.use({ requiresModules: [MODULES.pageBuilder] });

  test("publishing a draft moves it to the active list", async ({ pageBuilder, arrange }) => {
    await allure.story("Status transitions");
    await allure.description("A published draft leaves the draft list for the active list, and both counters match.");
    const draft = await test.step("arrange: a draft page", () => arrange.content.page());

    await test.step(`act: publish ${draft.name}`, async () => {
      await (await pageBuilder.openPage(draft.name, Route.draft)).publish();
    });

    await test.step("assert: the page moved from the draft list to the active list", async () => {
      expect(await pageBuilder.isListed(Route.draft, draft.name)).toBe(false);
      expect(await pageBuilder.isListed(Route.active, draft.name)).toBe(true);
      await expect(pageBuilder.listBlade.pageRow(draft.name).cell(Column.status)).toHaveText("Published");
    });
    for (const route of [Route.draft, Route.active]) {
      await test.step(`assert: the ${route} counter matches its list`, async () => {
        const { counter, listed } = await pageBuilder.counts(route);
        expect(counter).toBe(listed);
      });
    }
  });

  test("a published page can be archived", async ({ pageBuilder, arrange }) => {
    await allure.story("Status transitions");
    await allure.description("An archived published page leaves the active list for the archived list.");
    const published = await test.step("arrange: a published page", () => arrange.content.publishedPage());

    await test.step(`act: archive ${published.name}`, async () => {
      await (await pageBuilder.openPage(published.name, Route.active)).archive();
    });

    await test.step("assert: the page moved from the active list to the archived list", async () => {
      expect(await pageBuilder.isListed(Route.active, published.name)).toBe(false);
      expect(await pageBuilder.isListed(Route.archived, published.name)).toBe(true);
      await expect(pageBuilder.listBlade.pageRow(published.name).cell(Column.status)).toHaveText("Archived");
    });
  });

  test("unpublishing returns a page to the draft list", async ({ pageBuilder, arrange }) => {
    await allure.story("Status transitions");
    await allure.description("An unpublished page leaves the active list and is a draft again.");
    const published = await test.step("arrange: a published page", () => arrange.content.publishedPage());

    await test.step(`act: unpublish ${published.name}`, async () => {
      await (await pageBuilder.openPage(published.name, Route.active)).unpublish();
    });

    await test.step("assert: the page moved from the active list to the draft list", async () => {
      expect(await pageBuilder.isListed(Route.active, published.name)).toBe(false);
      expect(await pageBuilder.isListed(Route.draft, published.name)).toBe(true);
      await expect(pageBuilder.listBlade.pageRow(published.name).cell(Column.status)).toHaveText("Draft");
    });
  });
});

test.describe("user feedback (platform admin)", () => {
  test.use({ requiresModules: [MODULES.pageBuilder] });

  test("saving a page shows a success toast and disables Save again", async ({ pageBuilder, arrange }) => {
    await allure.story("Feedback");
    await allure.description(
      `Save is enabled only by a change; saving shows "${SAVE_TOAST}", which goes away, and disables Save again.`,
    );
    const draft = await test.step("arrange: a draft page", () => arrange.content.page());
    const details = await test.step(`arrange: open ${draft.name}`, () => pageBuilder.openPage(draft.name, Route.draft));

    await test.step("assert: Save is enabled once a field changes", async () => {
      await expect(details.saveButton).toHaveClass(DISABLED_TOOLBAR_BUTTON);
      await details.fill({ name: `${draft.name}-toast` });
      await expect(details.saveButton).not.toHaveClass(DISABLED_TOOLBAR_BUTTON);
    });

    await test.step("act: save", () => details.save());

    await test.step(`assert: "${SAVE_TOAST}" is shown and goes away, and Save is disabled`, async () => {
      await expect(pageBuilder.notifications.success.filter({ hasText: SAVE_TOAST })).toBeVisible();
      await expect(details.saveButton).toHaveClass(DISABLED_TOOLBAR_BUTTON);
      await expect(pageBuilder.notifications.success).toHaveCount(0, { timeout: TOAST_DISMISS_TIMEOUT_MS });
    });
  });
});
