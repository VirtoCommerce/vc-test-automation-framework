import * as allure from "allure-js-commons";

import { configuredSku } from "@dataset/builders/product-configuration";
import { expect, test } from "@fixtures";

const PRODUCT = { id: "product-smartphone-samsung-galaxy-a57-5g", sku: "smartphone-samsung-galaxy-a57-5g" } as const;
const QUANTITY = 3;
const CONFIGURABLE = {
  code: "laptop-acer-predator-helios-neo-16-ai",
  path: "laptops/acer-predator-helios-neo-16-ai",
} as const;
const MEMORY = "Memory";
const MEMORY_OPTION = "Samsung DDR5-4800 8GB";

test.beforeEach(async () => {
  await allure.epic("E2E");
  await allure.feature("Frontend / Cart");
});

test.describe("cart merge (anonymous, then signing in)", () => {
  test("the anonymous cart merges into the signed-in cart", async ({ frontend, page, shopper, arrange }) => {
    await allure.story("Merge");
    await allure.description("A visitor's cart is the customer's cart once the visitor signs in on the frontend.");
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
    arrange.carts.removeDefaultCartLater(customer.api);
    await test.step(`arrange: the visitor's cart holds ${PRODUCT.sku} ×${QUANTITY}`, () =>
      arrange.carts.defaultCart(shopper.api, [{ productId: PRODUCT.id, quantity: QUANTITY }]));
    const signIn = frontend.signIn();
    const cart = frontend.cart();

    await test.step("arrange: open the sign-in page with the visitor's cart", async () => {
      await signIn.navigate();
      await expect(signIn.cartQuantityLabel).toHaveText(String(QUANTITY));
    });

    await test.step(`act: sign in as ${customer.credentials.username}`, async () => {
      await signIn.signIn(customer.credentials.username, customer.credentials.password);
      await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
    });

    await test.step(`assert: the signed-in cart holds ${PRODUCT.sku} ×${QUANTITY}`, async () => {
      await cart.navigate();
      await expect(cart.lineItem(PRODUCT.sku).quantity.input).toHaveValue(String(QUANTITY));
    });
  });

  test("an anonymous configured product merges into a cart with a regular product", async ({
    frontend,
    page,
    arrange,
  }) => {
    await allure.story("Merge");
    await allure.description(
      "A product the visitor configured joins the customer's regular product in the cart once the visitor signs in.",
    );
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
    await test.step(`arrange: the customer's cart holds ${PRODUCT.sku} ×2`, () =>
      arrange.carts.defaultCart(customer.api, [{ productId: PRODUCT.id, quantity: 2 }]));
    const product = frontend.product(CONFIGURABLE.path);
    const signIn = frontend.signIn();
    const cart = frontend.cart();

    await test.step("arrange: the visitor adds a configured product to the cart", async () => {
      await product.navigate();
      await product.configuration.section(MEMORY).select(MEMORY_OPTION);
      await product.addToCartButton.click();
      await expect(product.cartQuantityLabel).toHaveText("1");
    });

    await test.step(`act: sign in as ${customer.credentials.username}`, async () => {
      await signIn.navigate();
      await expect(signIn.cartQuantityLabel).toHaveText("1");
      await signIn.signIn(customer.credentials.username, customer.credentials.password);
      await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
    });

    await test.step("assert: the cart holds the regular and the configured product", async () => {
      await cart.navigate();
      await expect(cart.lineItems).toHaveCount(2);
      await expect(cart.lineItem(PRODUCT.sku).root).toBeVisible();
      await expect(cart.lineItem(configuredSku(CONFIGURABLE.code)).root).toBeVisible();
    });
  });
});
