import type { PageDetailsBlade } from "@pages/backend/page-builder/page-builder";

import * as allure from "allure-js-commons";

import { expect, test } from "@fixtures";
import { Route } from "@pages/backend/page-builder/page-builder";

const DAY_MS = 86_400_000;
const START_IN_DAYS = 3;
const END_IN_DAYS = 30;
const RESTRICTIONS = [
  { audience: "a user group", value: "Wholesaler", select: (details: PageDetailsBlade) => details.userGroups },
  { audience: "an organization", value: "ACME Store", select: (details: PageDetailsBlade) => details.organization },
] as const;

test.beforeEach(async () => {
  await allure.epic("E2E");
  await allure.feature("Admin / Page builder");
});

test.describe("page configuration (platform admin)", () => {
  test("the details blade exposes every configuration field", async ({ pageBuilder, arrange }) => {
    await allure.story("Configuration");
    await allure.description(
      "A page's details have name, permalink and language; visibility, user groups and organization; and start " +
        "and end dates.",
    );
    const draft = await test.step("arrange: a draft page", () => arrange.content.page());

    const details = await test.step(`act: open ${draft.name} and expand every section`, async () => {
      const opened = await pageBuilder.openPage(draft.name, Route.draft);
      await opened.personalizationSection.expand();
      await opened.schedulingSection.expand();
      return opened;
    });

    await test.step("assert: every configuration field is there", async () => {
      await expect(details.nameInput).toBeEditable();
      await expect(details.permalinkInput).toBeEditable();
      await expect(details.language.toggle).toBeVisible();
      await expect(details.visibilityToggle).toBeAttached();
      await expect(details.userGroups.toggle).toBeVisible();
      await expect(details.organization.toggle).toBeVisible();
      await expect(details.startDate.input).toBeVisible();
      await expect(details.endDate.input).toBeVisible();
    });
  });

  test("the scheduling dates are saved", async ({ pageBuilder, arrange }) => {
    await allure.story("Configuration");
    await allure.description(
      `A start date ${START_IN_DAYS} days ahead and an end date ${END_IN_DAYS} days ahead are kept after saving.`,
    );
    const draft = await test.step("arrange: a draft page", () => arrange.content.page());
    const start = new Date(Date.now() + START_IN_DAYS * DAY_MS);
    const end = new Date(Date.now() + END_IN_DAYS * DAY_MS);

    const picked = await test.step("act: pick the start and end dates and save", async () => {
      const details = await pageBuilder.openPage(draft.name, Route.draft);
      await details.schedulingSection.expand();
      await details.startDate.select(start);
      await details.endDate.select(end);
      const values = {
        start: await details.startDate.input.inputValue(),
        end: await details.endDate.input.inputValue(),
      };
      await details.save();
      return values;
    });

    await test.step("assert: the reopened page shows the same dates", async () => {
      const reopened = await pageBuilder.openPage(draft.name, Route.draft);
      await reopened.schedulingSection.expand();
      await expect(reopened.startDate.input).toHaveValue(picked.start);
      await expect(reopened.endDate.input).toHaveValue(picked.end);
      expect(picked.start).not.toBe("");
      expect(picked.end).not.toBe("");
    });
  });

  test("turning visibility off is saved", async ({ pageBuilder, arrange }) => {
    await allure.story("Configuration");
    await allure.description("A visible page turned invisible stays invisible after saving.");
    const draft = await test.step("arrange: a visible draft page", () => arrange.content.page());

    await test.step("act: turn visibility off and save", async () => {
      const details = await pageBuilder.openPage(draft.name, Route.draft);
      await details.personalizationSection.expand();
      await expect(details.visibilityToggle).toBeChecked();
      await details.setVisibility(false);
      await details.save();
    });

    await test.step("assert: the reopened page is invisible", async () => {
      const reopened = await pageBuilder.openPage(draft.name, Route.draft);
      await reopened.personalizationSection.expand();
      await expect(reopened.visibilityToggle).not.toBeChecked();
    });
  });

  for (const { audience, value, select } of RESTRICTIONS) {
    test(`restricting the page to ${audience} is saved`, async ({ pageBuilder, arrange }) => {
      await allure.story("Configuration");
      await allure.description(`A page restricted to ${value} keeps the restriction after saving.`);
      const draft = await test.step("arrange: a draft page", () => arrange.content.page());

      await test.step(`act: restrict the page to ${value} and save`, async () => {
        const details = await pageBuilder.openPage(draft.name, Route.draft);
        await details.personalizationSection.expand();
        await select(details).select(value);
        await details.save();
      });

      await test.step(`assert: the reopened page is restricted to ${value}`, async () => {
        const reopened = await pageBuilder.openPage(draft.name, Route.draft);
        await reopened.personalizationSection.expand();
        expect(await select(reopened).value()).toContain(value);
      });
    });
  }
});
