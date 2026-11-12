import * as allure from "allure-js-commons";

import { MODULES } from "@dataset/modules";
import { expect, test } from "@fixtures";

const [ALPHA, BETA] = ["Alpha section", "Beta section"];
const TEXTS = [ALPHA, BETA];
const ADDED_TEXT = " edited live";
const HEADER_FIELD = "Page Header / H1";
const SEO_GROUP = "SEO Information";
const SEO_FIELDS = ["Page Title", "Meta Keywords", "Meta Description"];

test.beforeEach(async () => {
  await allure.epic("E2E");
  await allure.feature("Admin / Page designer");
});

test.describe("page designer editing (platform admin)", () => {
  test.use({ requiresModules: [MODULES.pageBuilder] });

  test("the preview follows a section's content as it is typed", async ({ pageDesigner, arrange, store }) => {
    await allure.story("Editing");
    await allure.description(
      "Text typed into a section's content shows in the preview before anything is saved, and only in that " +
        "section; the page has unsaved changes.",
    );
    const draft = await test.step("arrange: a draft page with two text sections", () =>
      arrange.content.page({ texts: TEXTS }));
    await test.step(`arrange: open ${draft.name} and edit its first section`, async () => {
      await pageDesigner.open(draft.id, store.defaultLanguage);
      await pageDesigner.sections.row(0).editButton.click();
    });

    await test.step(`act: type "${ADDED_TEXT}" at the end of the content`, () =>
      pageDesigner.sectionEditor.appendMarkdown("Content", ADDED_TEXT));

    await test.step("assert: the preview shows the new text in that section only", async () => {
      await expect(pageDesigner.previewSections).toHaveText([`${ALPHA}${ADDED_TEXT}`, BETA], { useInnerText: true });
      await expect(pageDesigner.saveButton).toBeEnabled();
    });
  });

  test("the page header and settings panels show the page's values", async ({ pageDesigner, arrange, store }) => {
    await allure.story("Editing");
    await allure.description(
      `Settings shows the page header (H1) the preview renders and the Hide Breadcrumbs option; Page Header ` +
        `shows the page's ${SEO_GROUP}. Hiding breadcrumbs removes them from the preview.`,
    );
    const draft = await test.step("arrange: a draft page", () => arrange.content.page({ texts: TEXTS }));
    await test.step(`arrange: open ${draft.name}`, () => pageDesigner.open(draft.id, store.defaultLanguage));

    await test.step("act: open Settings", () => pageDesigner.settingsButton.click());
    await test.step("assert: the header field holds the header the preview shows", async () => {
      await expect(pageDesigner.settingsPanel.textInput(HEADER_FIELD)).toHaveValue(draft.name);
      await expect(pageDesigner.previewHeading).toHaveText(draft.name);
      await expect(pageDesigner.previewBreadcrumbs).toBeVisible();
    });

    await test.step("act: hide breadcrumbs", () => pageDesigner.settingsPanel.checkbox("Hide Breadcrumbs").check());
    await test.step("assert: the preview has no breadcrumbs", async () => {
      await expect(pageDesigner.previewBreadcrumbs).toBeHidden();
    });

    await test.step(`act: open Page Header and expand ${SEO_GROUP}`, async () => {
      await pageDesigner.settingsPanel.backButton.click();
      await pageDesigner.pageHeaderButton.click();
      await pageDesigner.pageHeaderPanel.expand(SEO_GROUP);
    });
    await test.step(`assert: ${SEO_GROUP} lists the page title, keywords and description`, async () => {
      for (const field of SEO_FIELDS) {
        await expect(pageDesigner.pageHeaderPanel.textInput(field)).toBeVisible();
      }
      await expect(pageDesigner.pageHeaderPanel.textInput("Page Title")).toHaveValue(draft.name);
    });
  });

  test("a page header saved in Settings persists", async ({ pageDesigner, arrange, store }) => {
    await allure.story("Editing");
    await allure.description(
      "A page header typed into Settings shows in the preview, and after saving it is what the platform has and " +
        "what the designer shows when the page is opened again.",
    );
    const draft = await test.step("arrange: a draft page", () => arrange.content.page({ texts: TEXTS }));
    const header = `${draft.name} renamed`;
    await test.step(`arrange: open ${draft.name} and its Settings`, async () => {
      await pageDesigner.open(draft.id, store.defaultLanguage);
      await pageDesigner.settingsButton.click();
    });

    await test.step(`act: change the header to "${header}" and save`, async () => {
      await pageDesigner.settingsPanel.fillText(HEADER_FIELD, header);
      await expect(pageDesigner.previewHeading).toHaveText(header);
      await pageDesigner.save();
    });

    await test.step("assert: the platform has the new header", async () => {
      const { settings } = await arrange.admin.rest.pageBuilder.pages.content(draft.id);
      expect(settings.header).toBe(header);
    });
    await test.step("assert: the designer shows it after opening the page again", async () => {
      await pageDesigner.open(draft.id, store.defaultLanguage);
      await pageDesigner.settingsButton.click();
      await expect(pageDesigner.settingsPanel.textInput(HEADER_FIELD)).toHaveValue(header);
      await expect(pageDesigner.previewHeading).toHaveText(header);
    });
  });
});
