import { expect, test } from "@fixtures";
import { GetShoppingListDocument, GetShoppingListsDocument } from "@graphql/generated/graphql.ts";
import { whenGraphql } from "@pages/shared/responses.ts";
import { uniqueId } from "@support/unique-id.ts";

const SHARING_OPTIONS = [
  { scope: "Organization", option: "My organization" },
  { scope: "AnyoneAnonymous", option: "Anyone with link" },
] as const;

test.describe("list management (customer of their own)", () => {
  test.use({ shopperAs: "customer" });

  test("create a list", async ({ frontend, page, shopper, arrange }) => {
    arrange.carts.deleteShoppingListsLater(shopper);
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
      await whenGraphql(page, "AddWishlist", () => listsPage.settingsModal.saveButton.click());
    });

    await test.step(`assert: ${name} is listed and stored as private`, async () => {
      await expect(listsPage.card(name).root).toBeVisible();
      const { wishlists } = await shopper.graphql.execute(GetShoppingListsDocument, shopper.storeContext);
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
      const list = await test.step("arrange: a private list", () => arrange.carts.shoppingList(shopper));
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
        await whenGraphql(page, "ChangeWishlist", () => listsPage.sharingModal.saveButton.click());
      });

      await test.step(`assert: the list is stored with the ${scope} scope`, async () => {
        await expect(listsPage.sharingModal.root).toBeHidden();
        await expect
          .poll(async () => {
            const { wishlist } = await shopper.graphql.execute(GetShoppingListDocument, { listId: list.id });
            return wishlist?.sharingSetting?.scope;
          })
          .toBe(scope);
      });
    });
  }

  test("stop sharing a list", async ({ frontend, page, shopper, arrange }) => {
    const { list } = await test.step("arrange: a list shared with anyone", () =>
      arrange.carts.sharedList(shopper, [], "AnyoneAnonymous"));
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
      await whenGraphql(page, "ChangeWishlist", () => listsPage.sharingModal.stopSharingButton.click());
    });

    await test.step("assert: the list is stored as private", async () => {
      await expect(listsPage.sharingModal.root).toBeHidden();
      await expect
        .poll(async () => {
          const { wishlist } = await shopper.graphql.execute(GetShoppingListDocument, { listId: list.id });
          return wishlist?.sharingSetting?.scope;
        })
        .toBe("Private");
    });
  });

  test("rename and delete a list", async ({ frontend, page, shopper, arrange }) => {
    const list = await test.step("arrange: a list", () => arrange.carts.shoppingList(shopper));
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
      await whenGraphql(page, "ChangeWishlist", () => listsPage.settingsModal.saveButton.click());
    });
    await test.step("assert: the list has the new name", async () => {
      await expect(listsPage.card(renamed).root).toBeVisible();
      const { wishlist } = await shopper.graphql.execute(GetShoppingListDocument, { listId: list.id });
      expect(wishlist?.name).toBe(renamed);
    });

    await test.step("act: delete the list", async () => {
      const card = listsPage.card(renamed);
      await card.menuButton.click();
      await card.removeMenuItem.click();
      await whenGraphql(page, "DeleteWishlist", () => listsPage.deleteModal.confirmButton.click());
    });
    await test.step("assert: the list is gone", async () => {
      await expect(listsPage.card(renamed).root).toBeHidden();
      const { wishlist } = await shopper.graphql.execute(GetShoppingListDocument, { listId: list.id });
      expect(wishlist).toBeNull();
    });
  });
});
