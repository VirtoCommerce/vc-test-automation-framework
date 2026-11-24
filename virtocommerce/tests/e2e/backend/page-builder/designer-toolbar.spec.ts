import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { MODULES } from "@modules";
import { DESIGNER_PATH, Viewport } from "@pages/backend/page-designer/page-designer.ts";
import { pageContentOf } from "@support/page-builder.ts";

const PAGES_PATH = "/api/page-builder-pages";
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

test.describe("page designer toolbar (platform admin)", () => {
  test.use({ user: ADMINISTRATOR, modules: { pageBuilder: MODULES.pageBuilder } });

  test("the designer loads a page at its URL with a clean console", async ({ pageDesigner, store }) => {
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

  test("save and publish a page from the toolbar", async ({ api, pageDesigner, arrange, store }) => {
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
      const { content } = await pageContentOf(api, draft.id);
      expect(content[0]).toMatchObject({ text: { markdown: `${TEXTS[0]}${ADDED_TEXT}` } });
    });

    await test.step("act: publish", () => pageDesigner.publish());

    await test.step("assert: the page is published with nothing left to publish", async () => {
      await expect(pageDesigner.unpublishButton).toBeEnabled();
      await expect(pageDesigner.publishButton).toBeDisabled();
      expect(await publishStatusOf(api, draft.id)).toEqual({
        published: true,
        hasChanges: false,
      });
    });
  });
});

async function publishStatusOf(api: HttpClient, pageId: string): Promise<unknown> {
  return (await api.get(`${PAGES_PATH}/grouped/publish-status/${pageId}`)).expectOk().json<unknown>();
}
