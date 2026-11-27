import { expect, test } from "@fixtures";
import { ChangeShoppingListDocument } from "@graphql/generated/graphql.ts";

const PRODUCT_IDS = [
  "product-smartphone-apple-iphone-17-256gb-black",
  "product-smartphone-apple-iphone-17-256gb-mist-blue",
] as const;
const UNKNOWN_SHARING_KEY = "non-existent-sharing-key-000000";

test.describe("shared list (anonymous)", () => {
  test("a list shared with anyone is readable without signing in", async ({ frontend, arrange }) => {
    const owner = await test.step("arrange: a customer of their own", () => arrange.customers.customer());
    const { list, sharingKey } =
      await test.step("arrange: the customer's list of two products, shared with anyone", () =>
        arrange.carts.sharedList(
          owner,
          PRODUCT_IDS.map((productId) => ({ productId, quantity: 1 })),
          "AnyoneAnonymous",
        ));
    const sharedPage = frontend.sharedList(sharingKey);

    await test.step("act: open the share link", () => sharedPage.navigate());

    await test.step("assert: the list is shown read-only with both products", async () => {
      await expect(sharedPage.listTitle).toHaveText(list.name);
      await expect(sharedPage.lineItems).toHaveCount(PRODUCT_IDS.length);
      await expect(sharedPage.addToCartControls).toHaveCount(0);
    });
  });

  test("a list made private again is not reachable by its old link", async ({ frontend, arrange }) => {
    const owner = await test.step("arrange: a customer of their own", () => arrange.customers.customer());
    const { list, sharingKey } = await test.step("arrange: the customer's list, shared with anyone", () =>
      arrange.carts.sharedList(owner, [{ productId: PRODUCT_IDS[0], quantity: 1 }], "AnyoneAnonymous"));
    await test.step("arrange: the list is private again", () =>
      owner.graphql.execute(ChangeShoppingListDocument, { command: { listId: list.id, scope: "Private" } }));
    const sharedPage = frontend.sharedList(sharingKey);

    await test.step("act: open the old share link", () => sharedPage.navigate());

    await test.step("assert: the not-found page is shown without the list", async () => {
      await expect(sharedPage.notFound).toBeVisible();
      await expect(sharedPage.listTitle).toHaveCount(0);
      await expect(sharedPage.lineItems).toHaveCount(0);
    });
  });

  test("an unknown share link shows the not-found page", async ({ frontend }) => {
    const sharedPage = frontend.sharedList(UNKNOWN_SHARING_KEY);

    await test.step("act: open a share link with an unknown key", () => sharedPage.navigate());

    await test.step("assert: the not-found page is shown without list content", async () => {
      await expect(sharedPage.notFound).toBeVisible();
      await expect(sharedPage.lineItems).toHaveCount(0);
    });
  });
});
