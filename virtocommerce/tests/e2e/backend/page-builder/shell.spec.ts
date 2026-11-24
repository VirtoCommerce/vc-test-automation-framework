import { ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { MODULES } from "@modules";
import { Column, Route } from "@pages/backend/page-builder/routes.ts";

const ADMINISTRATOR_ROLE = "Administrator";

test.describe("page builder shell (platform admin)", () => {
  test.use({ modules: { pageBuilder: MODULES.pageBuilder } });

  test("the shell loads with the grid and a readable details blade", async ({ pageBuilder, arrange, store }) => {
    const draft = await test.step("arrange: a draft page", () => arrange.content.page());

    await test.step("act: open every page", () => pageBuilder.open(Route.all));
    await test.step("assert: the grid shows every column and some rows", async () => {
      for (const column of Object.values(Column)) {
        await expect(pageBuilder.listBlade.grid.columnHeader(column)).toBeVisible();
      }
      await expect(pageBuilder.listBlade.grid.rows.first()).toBeVisible();
    });

    const details = await test.step(`act: open ${draft.name}`, () => pageBuilder.openPage(draft.name));
    await test.step("assert: the details show the page and its sections", async () => {
      await expect(details.nameInput).toHaveValue(draft.name);
      await expect(details.permalinkInput).toHaveValue(draft.permalink);
      expect(await details.language.value()).toBe(store.defaultLanguage);
      await details.personalizationSection.expand();
      expect(await details.organization.optionTexts()).not.toEqual([]);
      await details.schedulingSection.expand();
      await expect(details.startDate.input).toBeVisible();
    });
  });

  test("the details blade shows the frontend URL next to the permalink", async ({ pageBuilder, arrange, env }) => {
    const draft = await test.step("arrange: a draft page", () => arrange.content.page());

    const details = await test.step(`act: open ${draft.name}`, () => pageBuilder.openPage(draft.name, Route.draft));

    await test.step("assert: the permalink prefix is on the frontend's host", async () => {
      await expect(details.permalinkPrefix).toContainText(new URL(env.FRONTEND_BASE_URL).hostname);
      await expect(details.permalinkInput).toHaveValue(draft.permalink);
    });
  });

  test("the shell shows the signed-in user, their role and the logo", async ({ pageBuilder }) => {
    await test.step("act: open the shell", () => pageBuilder.open(Route.all));

    await test.step(`assert: the profile shows ${ADMINISTRATOR.username} as ${ADMINISTRATOR_ROLE}, and the logo`, async () => {
      await expect(pageBuilder.userName).toHaveText(ADMINISTRATOR.username);
      await expect(pageBuilder.userRole).toHaveText(ADMINISTRATOR_ROLE);
      await expect(pageBuilder.logo).toBeVisible();
    });
  });
});
