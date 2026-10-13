import * as allure from "allure-js-commons";

import { GetShoppingListDocument, GetShoppingListsDocument } from "@api/graphql/generated/graphql";
import { uniqueId } from "@core/unique-id";
import { expect, test } from "@fixtures";
import { isGraphqlOperation } from "@pages/selectors";

const SHARING_OPTIONS = [
  { scope: "Organization", option: "My organization" },
  { scope: "AnyoneAnonymous", option: "Anyone with link" },
] as const;

test.beforeEach(async () => {
  await allure.epic("E2E");
  await allure.feature("Frontend / Lists");
});

test.describe("list management (customer of their own)", () => {
  test.use({ shopperKind: "customer" });

  test("create a list", async ({ frontend, page, shopper, arrange }) => {
    await allure.story("Create");
    await allure.description("A list created on the lists page is shown and stored as a private list.");
    arrange.carts.deleteShoppingListsLater(shopper.api);
    const listsPage = frontend.lists();
    const name = uniqueId("list");

    await test.step("arrange: open the create-list modal", async () => {
      await listsPage.navigate();
      await listsPage.createListButton.click();
      await expect(listsPage.settingsModal.root).toBeVisible();
    });

    await test.step(`act: create ${name}`, async () => {
      await listsPage.settingsModal.nameInput.fill(name);
      await listsPage.settingsModal.descriptionInput.fill("Created by an automated test");
      await Promise.all([
        page.waitForResponse(isGraphqlOperation("AddWishlist")),
        listsPage.settingsModal.saveButton.click(),
      ]);
    });

    await test.step(`assert: ${name} is listed and stored as private`, async () => {
      await expect(listsPage.card(name).root).toBeVisible();
      const { wishlists } = await shopper.api.graphql.execute(
        GetShoppingListsDocument,
        await shopper.api.storeContext(),
      );
      expect(
        wishlists?.items?.map((list) => ({ name: list?.name, scope: list?.sharingSetting?.scope })),
      ).toContainEqual({
        name,
        scope: "Private",
      });
    });
  });

  for (const { scope, option } of SHARING_OPTIONS) {
    test(`share a list with ${option}`, async ({ frontend, page, shopper, arrange }) => {
      await allure.story("Share");
      await allure.description(`Choosing "${option}" in a private list's Share modal stores the ${scope} scope.`);
      const list = await test.step("arrange: a private list", () => arrange.carts.shoppingList(shopper.api));
      const listsPage = frontend.lists();
      const card = listsPage.card(list.name);

      await test.step("arrange: open the list's Share modal", async () => {
        await listsPage.navigate();
        await card.menuButton.click();
        await card.shareMenuItem.click();
        await expect(listsPage.sharingModal.root).toBeVisible();
      });

      await test.step(`act: choose "${option}" and save`, async () => {
        await listsPage.sharingModal.option(scope).click();
        await Promise.all([
          page.waitForResponse(isGraphqlOperation("ChangeWishlist")),
          listsPage.sharingModal.saveButton.click(),
        ]);
      });

      await test.step(`assert: the list is stored with the ${scope} scope`, async () => {
        await expect(listsPage.sharingModal.root).toBeHidden();
        await expect
          .poll(async () => {
            const { wishlist } = await shopper.api.graphql.execute(GetShoppingListDocument, { listId: list.id });
            return wishlist?.sharingSetting?.scope;
          })
          .toBe(scope);
      });
    });
  }

  test("stop sharing a list", async ({ frontend, page, shopper, arrange }) => {
    await allure.story("Share");
    await allure.description(
      "Making a list shared with anyone private again asks to confirm that its readers lose access, then stores it " +
        "as private.",
    );
    const { list } = await test.step("arrange: a list shared with anyone", () =>
      arrange.carts.sharedList(shopper.api, [], "AnyoneAnonymous"));
    const listsPage = frontend.lists();
    const card = listsPage.card(list.name);

    await test.step("arrange: open the list's Share modal", async () => {
      await listsPage.navigate();
      await card.menuButton.click();
      await card.shareMenuItem.click();
      await expect(listsPage.sharingModal.root).toBeVisible();
    });

    await test.step("act: choose Private, save and confirm to stop sharing", async () => {
      await listsPage.sharingModal.option("Private").click();
      await listsPage.sharingModal.saveButton.click();
      await Promise.all([
        page.waitForResponse(isGraphqlOperation("ChangeWishlist")),
        listsPage.sharingModal.stopSharingButton.click(),
      ]);
    });

    await test.step("assert: the list is stored as private", async () => {
      await expect(listsPage.sharingModal.root).toBeHidden();
      await expect
        .poll(async () => {
          const { wishlist } = await shopper.api.graphql.execute(GetShoppingListDocument, { listId: list.id });
          return wishlist?.sharingSetting?.scope;
        })
        .toBe("Private");
    });
  });

  test("rename and delete a list", async ({ frontend, page, shopper, arrange }) => {
    await allure.story("Edit");
    await allure.description("A renamed list is shown and stored under its new name; a deleted list is gone.");
    const list = await test.step("arrange: a list", () => arrange.carts.shoppingList(shopper.api));
    const listsPage = frontend.lists();
    const renamed = uniqueId("renamed");

    await test.step("arrange: open the lists page", async () => {
      await listsPage.navigate();
      await expect(listsPage.card(list.name).root).toBeVisible();
    });

    await test.step(`act: rename the list to ${renamed}`, async () => {
      const card = listsPage.card(list.name);
      await card.menuButton.click();
      await card.editMenuItem.click();
      await listsPage.settingsModal.nameInput.fill(renamed);
      await Promise.all([
        page.waitForResponse(isGraphqlOperation("ChangeWishlist")),
        listsPage.settingsModal.saveButton.click(),
      ]);
    });
    await test.step("assert: the list has the new name", async () => {
      await expect(listsPage.card(renamed).root).toBeVisible();
      const { wishlist } = await shopper.api.graphql.execute(GetShoppingListDocument, { listId: list.id });
      expect(wishlist?.name).toBe(renamed);
    });

    await test.step("act: delete the list", async () => {
      const card = listsPage.card(renamed);
      await card.menuButton.click();
      await card.removeMenuItem.click();
      await Promise.all([
        page.waitForResponse(isGraphqlOperation("DeleteWishlist")),
        listsPage.deleteModal.confirmButton.click(),
      ]);
    });
    await test.step("assert: the list is gone", async () => {
      await expect(listsPage.card(renamed).root).toBeHidden();
      const { wishlist } = await shopper.api.graphql.execute(GetShoppingListDocument, { listId: list.id });
      expect(wishlist).toBeNull();
    });
  });
});
