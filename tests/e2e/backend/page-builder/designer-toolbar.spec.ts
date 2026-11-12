import * as allure from "allure-js-commons";

import { MODULES } from "@dataset/modules";
import { expect, KNOWN_ISSUES, knownIssue, test } from "@fixtures";
import { DESIGNER_PATH, Viewport } from "@pages/backend/page-designer/page-designer";

const ABOUT_STORE_PAGE = "page-acme-about-store";
const ABOUT_STORE_WELCOME = "Welcome to ACME Store";
const DESIGNER_TITLE = "Template Builder - VirtoCommerce";
const TEXTS = ["Alpha section", "Beta section"];
const ADDED_TEXT = " saved from the designer";

const VIEWPORTS_BY_WIDTH = [
  { viewport: Viewport.phone, url: /preview-mode=phone/ },
  { viewport: Viewport.tablet, url: /preview-mode=tablet/ },
  { viewport: Viewport.desktopHalf, url: /preview-mode=desktop-50/ },
  { viewport: Viewport.desktop, url: /^(?!.*preview-mode)/ },
  { viewport: Viewport.fullScreen, url: /preview-mode=fullscreen/ },
];

test.beforeEach(async () => {
  await allure.epic("E2E");
  await allure.feature("Admin / Page designer");
});

test.describe("page designer toolbar (platform admin)", () => {
  test.use({ requiresModules: [MODULES.pageBuilder] });

  test("the designer loads a page at its URL with a clean console", async ({ pageDesigner, store }) => {
    await allure.story("Toolbar");
    await allure.description(
      "The designer opens a seeded page at the designer app's URL with its section list, the live preview (the " +
        "frontend in an iframe) renders the page, and the designer logs no console or page errors.",
    );

    await test.step(`act: open ${ABOUT_STORE_PAGE} in the designer`, () =>
      pageDesigner.open(ABOUT_STORE_PAGE, store.defaultLanguage));

    await test.step("assert: the designer app shows the page's sections", async () => {
      expect(new URL(pageDesigner.page.url()).pathname).toBe(DESIGNER_PATH);
      await expect(pageDesigner.page).toHaveTitle(DESIGNER_TITLE);
      await expect(pageDesigner.sections.rows).not.toHaveCount(0);
    });
    await test.step("assert: the preview renders the page's content", async () => {
      await expect(pageDesigner.preview.getByText(ABOUT_STORE_WELCOME)).toBeVisible();
    });
    await test.step("assert: no console or page errors", () => {
      expect(pageDesigner.consoleErrors()).toEqual([]);
    });
  });

  test("switch the preview between viewports", async ({ pageDesigner, store }) => {
    await allure.story("Toolbar");
    await allure.description(
      "Each viewport of the viewport menu is shown on its trigger and in the URL, and the preview widens from " +
        "Phone to Tablet, Desktop 50/50, Desktop and Full screen.",
    );
    await test.step(`arrange: open ${ABOUT_STORE_PAGE} in the designer`, () =>
      pageDesigner.open(ABOUT_STORE_PAGE, store.defaultLanguage));

    let narrower = 0;
    for (const { viewport, url } of VIEWPORTS_BY_WIDTH) {
      await test.step(`act: choose ${viewport}`, () => pageDesigner.chooseViewport(viewport));
      await test.step(`assert: the preview is in ${viewport} and wider than the previous viewport`, async () => {
        await expect(pageDesigner.viewportButton).toHaveAccessibleName(viewport);
        await expect(pageDesigner.page).toHaveURL(url);
        await expect.poll(() => pageDesigner.previewWidth()).toBeGreaterThan(narrower);
        narrower = await pageDesigner.previewWidth();
      });
    }
  });

  test("save and publish a page from the toolbar", async ({ pageDesigner, arrange, store }) => {
    await allure.story("Toolbar");
    await allure.description(
      "A change saved from the toolbar reaches the platform and turns Save off again; publishing it makes the " +
        "page published with no unpublished changes.",
    );
    const draft = await test.step("arrange: a draft page with two text sections", () =>
      arrange.content.page({ texts: TEXTS }));
    await test.step(`arrange: open ${draft.name} and change its first section`, async () => {
      await pageDesigner.open(draft.id, store.defaultLanguage);
      await pageDesigner.sections.row(0).editButton.click();
      await pageDesigner.sectionEditor.appendMarkdown("Content", ADDED_TEXT);
      await expect(pageDesigner.saveButton).toBeEnabled();
    });

    await test.step("act: save", () => pageDesigner.save());

    await test.step("assert: the platform has the change and Save is off", async () => {
      await expect(pageDesigner.saveButton).toBeDisabled();
      const { content } = await arrange.admin.rest.pageBuilder.pages.content(draft.id);
      expect(content[0]).toMatchObject({ text: { markdown: `${TEXTS[0]}${ADDED_TEXT}` } });
    });

    await test.step("act: publish", () => pageDesigner.publish());

    await test.step("assert: the page is published with nothing left to publish", async () => {
      await expect(pageDesigner.unpublishButton).toBeEnabled();
      await expect(pageDesigner.publishButton).toBeDisabled();
      expect(await arrange.admin.rest.pageBuilder.pages.publishStatus(draft.id)).toEqual({
        published: true,
        hasChanges: false,
      });
    });
  });
});

test.describe("page designer without the preview header patch (platform admin)", () => {
  test.use({ requiresModules: [MODULES.pageBuilder], designerPreviewPatched: false });

  test("the preview renders the page", async ({ pageDesigner, store }) => {
    await knownIssue(KNOWN_ISSUES.designerPreviewBlockedByEmbedderPolicy);
    await allure.story("Toolbar");
    await allure.description(
      "Guard of the preview header patch: once the defect is fixed the preview renders without it, this test " +
        "passes unexpectedly, and the patch and this mark can go.",
    );

    await test.step(`act: open ${ABOUT_STORE_PAGE} in the designer`, () =>
      pageDesigner.open(ABOUT_STORE_PAGE, store.defaultLanguage));

    await test.step("assert: the preview renders the page's content", async () => {
      await expect(pageDesigner.preview.getByText(ABOUT_STORE_WELCOME)).toBeVisible();
    });
  });
});
