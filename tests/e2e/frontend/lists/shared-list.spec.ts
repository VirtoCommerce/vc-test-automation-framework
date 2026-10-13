import * as allure from "allure-js-commons";

import { ChangeShoppingListDocument } from "@api/graphql/generated/graphql";
import { expect, test } from "@fixtures";

const PRODUCT_IDS = [
  "product-smartphone-apple-iphone-17-256gb-black",
  "product-smartphone-apple-iphone-17-256gb-mist-blue",
] as const;
const UNKNOWN_SHARING_KEY = "non-existent-sharing-key-000000";

test.beforeEach(async () => {
  await allure.epic("E2E");
  await allure.feature("Frontend / Lists");
});

test.describe("shared list (anonymous)", () => {
  test("a list shared with anyone is readable without signing in", async ({ frontend, arrange }) => {
    await allure.story("Shared list");
    await allure.description(
      "A list shared with anyone opens by its link for a visitor, read-only, with its products.",
    );
    const owner = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
    const { list, sharingKey } =
      await test.step("arrange: the customer's list of two products, shared with anyone", () =>
        arrange.carts.sharedList(
          owner.api,
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
    await allure.story("Shared list");
    await allure.description("Once a shared list is private again, its old share link shows the not-found page.");
    const owner = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
    const { list, sharingKey } = await test.step("arrange: the customer's list, shared with anyone", () =>
      arrange.carts.sharedList(owner.api, [{ productId: PRODUCT_IDS[0], quantity: 1 }], "AnyoneAnonymous"));
    await test.step("arrange: the list is private again", () =>
      owner.api.graphql.execute(ChangeShoppingListDocument, { command: { listId: list.id, scope: "Private" } }));
    const sharedPage = frontend.sharedList(sharingKey);

    await test.step("act: open the old share link", () => sharedPage.navigate());

    await test.step("assert: the not-found page is shown without the list", async () => {
      await expect(sharedPage.notFound).toBeVisible();
      await expect(sharedPage.listTitle).toHaveCount(0);
      await expect(sharedPage.lineItems).toHaveCount(0);
    });
  });

  test("an unknown share link shows the not-found page", async ({ frontend }) => {
    await allure.story("Shared list");
    await allure.description("A share link with an unknown key shows the not-found page.");
    const sharedPage = frontend.sharedList(UNKNOWN_SHARING_KEY);

    await test.step("act: open a share link with an unknown key", () => sharedPage.navigate());

    await test.step("assert: the not-found page is shown without list content", async () => {
      await expect(sharedPage.notFound).toBeVisible();
      await expect(sharedPage.lineItems).toHaveCount(0);
    });
  });
});
