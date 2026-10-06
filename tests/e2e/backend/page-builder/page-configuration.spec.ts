import type { PageDetailsBlade } from "@pages/backend/page-builder/page-details-blade";

import * as allure from "allure-js-commons";

import { daysFromNow } from "@core/dates";
import { expect, test } from "@fixtures";
import { Column, Route } from "@pages/backend/page-builder/constants";

import { arrangeDraftPage, DEFAULT_LANGUAGE } from "./page-builder-support";

const USER_GROUP = "Wholesaler";
const ORGANIZATION = "ACME Store";

test.beforeEach(async () => {
  await allure.feature("Page Builder Shell / Page configuration (E2E)");
});

test.describe("page configuration (platform admin)", () => {
  test("the basic information shows the name, permalink and language", async ({
    pageBuilder,
    pageBuilderClient,
    cleanupStack,
    env,
  }) => {
    const page = await arrangeDraftPage(pageBuilderClient, cleanupStack, env.storeId);

    const details = await test.step(`act: open ${page.name}`, () => pageBuilder.openPage(page.name, Route.draft));

    await test.step("assert: name and permalink are filled and editable, language is set", async () => {
      await expect(details.basicSection.root).toBeVisible();
      await expect(details.nameInput).toHaveValue(page.name);
      await expect(details.permalinkInput).toHaveValue(page.permalink);
      await expect(details.nameInput).toBeEditable();
      await expect(details.permalinkInput).toBeEditable();
      expect(await details.language.value()).toBe(DEFAULT_LANGUAGE);
    });
  });

  test("the scheduling dates are saved", async ({ pageBuilder, pageBuilderClient, cleanupStack, env }) => {
    const page = await arrangeDraftPage(pageBuilderClient, cleanupStack, env.storeId);
    const start = daysFromNow(3);
    const end = daysFromNow(30);

    const picked = await test.step("act: pick a start and an end date and save", async () => {
      const details = await test.step(`arrange: open ${page.name}`, () => pageBuilder.openPage(page.name, Route.draft));
      await details.schedulingSection.expand();
      await details.startDate.select(start);
      await details.endDate.select(end);
      await expect(details.startDate.input).not.toHaveValue("");
      await expect(details.endDate.input).not.toHaveValue("");
      const values = {
        start: await details.startDate.input.inputValue(),
        end: await details.endDate.input.inputValue(),
      };
      await pageBuilder.saveDetails();
      return values;
    });

    await test.step("assert: reopening the page shows the same dates", async () => {
      const reopened = await pageBuilder.openPage(page.name, Route.draft);
      await reopened.schedulingSection.expand();
      await expect(reopened.startDate.input).toHaveValue(picked.start);
      await expect(reopened.endDate.input).toHaveValue(picked.end);
    });
  });

  test("turning visibility off is saved", async ({ pageBuilder, pageBuilderClient, cleanupStack, env }) => {
    const page = await arrangeDraftPage(pageBuilderClient, cleanupStack, env.storeId);

    await test.step("act: turn visibility off and save", async () => {
      const details = await test.step(`arrange: open ${page.name}`, () => pageBuilder.openPage(page.name, Route.draft));
      await details.personalizationSection.expand();
      await expect(details.visibilityToggle).toBeChecked();
      await details.setVisibility(false);
      await expect(details.visibilityToggle).not.toBeChecked();
      await pageBuilder.saveDetails();
    });

    await test.step("assert: reopening the page keeps visibility off", async () => {
      const reopened = await pageBuilder.openPage(page.name, Route.draft);
      await reopened.personalizationSection.expand();
      await expect(reopened.visibilityToggle).not.toBeChecked();
    });
  });

  for (const { title, value, select } of [
    { title: "a user group", value: USER_GROUP, select: (details: PageDetailsBlade) => details.userGroups },
    { title: "an organization", value: ORGANIZATION, select: (details: PageDetailsBlade) => details.organization },
  ]) {
    test(`restricting the page to ${title} is saved`, async ({ pageBuilder, pageBuilderClient, cleanupStack, env }) => {
      const page = await arrangeDraftPage(pageBuilderClient, cleanupStack, env.storeId);

      await test.step(`act: restrict the page to ${value} and save`, async () => {
        const details = await test.step(`arrange: open ${page.name}`, () =>
          pageBuilder.openPage(page.name, Route.draft));
        await details.personalizationSection.expand();
        expect(await select(details).optionTexts()).toContain(value);
        await select(details).select(value);
        expect(await select(details).value()).toContain(value);
        await pageBuilder.saveDetails();
      });

      await test.step("assert: reopening the page keeps the restriction", async () => {
        const reopened = await pageBuilder.openPage(page.name, Route.draft);
        await reopened.personalizationSection.expand();
        expect(await select(reopened).value()).toContain(value);
      });
    });
  }

  test("the details blade exposes every configuration field", async ({
    pageBuilder,
    pageBuilderClient,
    cleanupStack,
    env,
  }) => {
    const page = await arrangeDraftPage(pageBuilderClient, cleanupStack, env.storeId);
    const renamed = `${page.name}-cfg`;
    const details = await test.step(`arrange: open ${page.name}`, () => pageBuilder.openPage(page.name, Route.draft));

    await test.step("assert: basic information has name, permalink and language", async () => {
      await expect(details.nameInput).toBeVisible();
      await expect(details.permalinkInput).toBeVisible();
      await expect(details.language.toggle).toBeVisible();
    });

    await test.step("assert: personalization has visibility, user groups and organization", async () => {
      await details.personalizationSection.expand();
      await expect(details.visibilityToggle).toBeAttached();
      await expect(details.userGroups.toggle).toBeVisible();
      await expect(details.organization.toggle).toBeVisible();
    });

    await test.step("assert: scheduling has start and end dates", async () => {
      await details.schedulingSection.expand();
      await expect(details.startDate.input).toBeVisible();
      await expect(details.endDate.input).toBeVisible();
    });

    await test.step(`act: rename to ${renamed} and save`, async () => {
      await details.fill({ name: renamed, permalink: `/${renamed}` });
      await pageBuilder.saveDetails();
    });

    await test.step("assert: the list shows the new name and permalink", async () => {
      const row = (await pageBuilder.expectListed(Route.draft, renamed)).pageRow(renamed);
      expect(await row.value(Column.permalink)).toBe(`/${renamed}`);
    });
  });
});
