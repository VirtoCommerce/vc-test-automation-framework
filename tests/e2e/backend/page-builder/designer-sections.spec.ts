import type { SectionList } from "@pages/backend/page-designer/section-list";

import * as allure from "allure-js-commons";

import { textSectionId } from "@dataset/builders/page-builder";
import { MODULES } from "@dataset/modules";
import { expect, test } from "@fixtures";
import { SectionAction } from "@pages/backend/page-designer/section-list";

const [ALPHA, BETA, GAMMA] = ["Alpha section", "Beta section", "Gamma section"];
const TEXTS = [ALPHA, BETA, GAMMA];
const [ALPHA_ID, BETA_ID, GAMMA_ID] = [textSectionId(0), textSectionId(1), textSectionId(2)];
const ADDED_BLOCK = "Call to Action";
const LIBRARY_SEARCH = "prod";
const SECTION_MENU = [
  SectionAction.hide,
  SectionAction.copy,
  SectionAction.pasteBefore,
  SectionAction.pasteAfter,
  SectionAction.duplicate,
  SectionAction.delete,
];

const REORDERS = [
  {
    how: "drag the first section below the third",
    move: (sections: SectionList) => sections.row(0).dragBelow(sections.row(2)),
    ids: [BETA_ID, GAMMA_ID, ALPHA_ID],
    texts: [BETA, GAMMA, ALPHA],
  },
  {
    how: "move the first section down with the keyboard",
    move: (sections: SectionList) => sections.row(0).moveDown(),
    ids: [BETA_ID, ALPHA_ID, GAMMA_ID],
    texts: [BETA, ALPHA, GAMMA],
  },
];

test.beforeEach(async () => {
  await allure.epic("E2E");
  await allure.feature("Admin / Page designer");
});

test.describe("page designer sections (platform admin)", () => {
  test.use({ requiresModules: [MODULES.pageBuilder] });

  test.beforeEach(async ({ pageDesigner, arrange, store }) => {
    const draft = await test.step("arrange: a draft page with three text sections", () =>
      arrange.content.page({ texts: TEXTS }));
    await test.step(`arrange: open ${draft.name} in the designer`, async () => {
      await pageDesigner.open(draft.id, store.defaultLanguage);
      await expect(pageDesigner.previewSections).toHaveCount(TEXTS.length);
    });
  });

  test("add a section from the block library", async ({ pageDesigner }) => {
    await allure.story("Sections");
    await allure.description(
      `A ${ADDED_BLOCK} block inserted after the first section shows in the section list and in the preview at ` +
        "that place, and the page has unsaved changes.",
    );
    const { sections } = pageDesigner;

    await test.step(`act: insert a ${ADDED_BLOCK} after the first section`, async () => {
      await sections.insertAfter(0);
      await pageDesigner.library.add(ADDED_BLOCK);
      await pageDesigner.sectionEditor.backButton.click();
    });

    await test.step(`assert: the ${ADDED_BLOCK} is the second section in the list and in the preview`, async () => {
      await expect(sections.rows).toHaveCount(TEXTS.length + 1);
      await expect(sections.row(1).actionsButton).toHaveAccessibleName(`Actions for ${ADDED_BLOCK}`);
      const ids = await sections.ids();
      expect(ids).toEqual([ALPHA_ID, expect.not.stringMatching(/^text-/), BETA_ID, GAMMA_ID]);
      await expect.poll(() => pageDesigner.previewSectionIds()).toEqual(ids);
      await expect(pageDesigner.saveButton).toBeEnabled();
    });
  });

  test("search the block library", async ({ pageDesigner }) => {
    await allure.story("Sections");
    await allure.description(
      `Searching the block library for "${LIBRARY_SEARCH}" lists only the block types whose names contain it, ` +
        "and a search without matches says so.",
    );
    const { library } = pageDesigner;
    const all = await test.step("arrange: open the block library", async () => {
      await pageDesigner.addBlockButton.click();
      await expect(library.addButtons).not.toHaveCount(0);
      return library.blockNames();
    });

    await test.step(`act: search for "${LIBRARY_SEARCH}"`, () => library.search(LIBRARY_SEARCH));

    await test.step("assert: only the matching block types are listed", async () => {
      const matching = all.filter((name) => name.toLowerCase().includes(LIBRARY_SEARCH));
      expect(matching).not.toEqual([]);
      await expect.poll(() => library.blockNames()).toEqual(matching);
    });

    await test.step("act: search for a name no block has", () => library.search("no-such-block"));

    await test.step("assert: no block types are listed", async () => {
      await expect(library.addButtons).toHaveCount(0);
      await expect(library.noBlocksMessage).toBeVisible();
    });
  });

  test("copy a section and paste it before and after others", async ({ pageDesigner }) => {
    await allure.story("Sections");
    await allure.description(
      "A copied section pasted after the last section and before the first one shows as a new section in both " +
        "places, in the list and in the preview.",
    );
    const { sections } = pageDesigner;

    await test.step("act: copy the first section and paste it after the last one", async () => {
      await sections.row(0).act(SectionAction.copy);
      await sections.row(2).act(SectionAction.pasteAfter);
    });
    await test.step("assert: the copy is the last section", async () => {
      await expect(pageDesigner.notifications.filter({ hasText: "Section pasted" })).toBeVisible();
      await expect(pageDesigner.previewSections).toHaveText([ALPHA, BETA, GAMMA, ALPHA], { useInnerText: true });
    });

    await test.step("act: copy the third section and paste it before the first one", async () => {
      await sections.row(2).act(SectionAction.copy);
      await sections.row(0).act(SectionAction.pasteBefore);
    });
    await test.step("assert: the copy is the first section, and every section has its own id", async () => {
      await expect(pageDesigner.previewSections).toHaveText([GAMMA, ALPHA, BETA, GAMMA, ALPHA], { useInnerText: true });
      const ids = await sections.ids();
      expect(new Set(ids).size).toBe(ids.length);
      await expect.poll(() => pageDesigner.previewSectionIds()).toEqual(ids);
    });
  });

  test("duplicate a section", async ({ pageDesigner }) => {
    await allure.story("Sections");
    await allure.description("A duplicated section shows right after the original, in the list and in the preview.");
    const { sections } = pageDesigner;

    await test.step("act: duplicate the second section", () => sections.row(1).act(SectionAction.duplicate));

    await test.step("assert: the duplicate follows the original", async () => {
      await expect(pageDesigner.notifications.filter({ hasText: "Section duplicated" })).toBeVisible();
      await expect(sections.rows).toHaveCount(TEXTS.length + 1);
      await expect(pageDesigner.previewSections).toHaveText([ALPHA, BETA, BETA, GAMMA], { useInnerText: true });
    });
  });

  test("delete a section", async ({ pageDesigner }) => {
    await allure.story("Sections");
    await allure.description("A deleted section leaves the list and the preview once the deletion is confirmed.");
    const { sections } = pageDesigner;

    await test.step("act: delete the first section and confirm", () => sections.row(0).delete());

    await test.step("assert: the list and the preview show only the other sections", async () => {
      await expect.poll(() => sections.ids()).toEqual([BETA_ID, GAMMA_ID]);
      await expect.poll(() => pageDesigner.previewSectionIds()).toEqual([BETA_ID, GAMMA_ID]);
    });
  });

  test("hide a section and show it again", async ({ pageDesigner }) => {
    await allure.story("Sections");
    await allure.description(
      "A hidden section stays in the list, leaves the preview and offers Show in its menu; showing it puts it " +
        "back in the preview.",
    );
    const row = pageDesigner.sections.row(1);

    await test.step("act: hide the second section", () => row.act(SectionAction.hide));

    await test.step("assert: the preview leaves it out and its menu offers Show", async () => {
      await expect(pageDesigner.sections.rows).toHaveCount(TEXTS.length);
      await expect(pageDesigner.previewSections).toHaveText([ALPHA, GAMMA], { useInnerText: true });
      await row.openMenu();
      await expect(row.menuItems.first()).toHaveAccessibleName(SectionAction.show);
      await pageDesigner.page.keyboard.press("Escape");
    });

    await test.step("act: show the second section", () => row.act(SectionAction.show));

    await test.step("assert: the preview shows it again", async () => {
      await expect(pageDesigner.previewSections).toHaveText([ALPHA, BETA, GAMMA], { useInnerText: true });
    });
  });

  test("the section menu offers every action and closes without one", async ({ pageDesigner }) => {
    await allure.story("Sections");
    await allure.description(
      "A section's actions menu lists Hide, Copy, Paste before, Paste after, Duplicate and Delete; Escape closes " +
        "it, and cancelling a deletion keeps the section.",
    );
    const row = pageDesigner.sections.row(0);

    await test.step("act: open the first section's menu", () => row.openMenu());
    await test.step("assert: the menu lists every action", async () => {
      await expect(row.menu).toMatchAriaSnapshot(
        ["- menu:", ...SECTION_MENU.map((action) => `  - menuitem "${action}"`)].join("\n"),
      );
    });

    await test.step("act: press Escape", () => pageDesigner.page.keyboard.press("Escape"));
    await test.step("assert: the menu is closed", async () => {
      await expect(row.menu).toBeHidden();
    });

    await test.step("act: choose Delete and cancel", () => row.cancelDelete());
    await test.step("assert: the section is kept", async () => {
      await expect.poll(() => pageDesigner.sections.ids()).toEqual([ALPHA_ID, BETA_ID, GAMMA_ID]);
      await expect(pageDesigner.previewSections).toHaveText(TEXTS, { useInnerText: true });
    });
  });

  for (const { how, move, ids, texts } of REORDERS) {
    test(`reorder sections: ${how}`, async ({ pageDesigner }) => {
      await allure.story("Sections");
      await allure.description(
        "A section moved in the list takes its new place in the list and in the preview, and the page has unsaved " +
          "changes.",
      );

      await test.step(`act: ${how}`, () => move(pageDesigner.sections));

      await test.step("assert: the list and the preview show the new order", async () => {
        await expect.poll(() => pageDesigner.sections.ids()).toEqual(ids);
        await expect(pageDesigner.previewSections).toHaveText(texts, { useInnerText: true });
        await expect(pageDesigner.saveButton).toBeEnabled();
      });
    });
  }
});
