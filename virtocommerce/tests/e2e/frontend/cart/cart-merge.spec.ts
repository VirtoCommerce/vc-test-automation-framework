import { expect, test } from "@fixtures";

const SKU = "smartphone-samsung-galaxy-a57-5g";
const QUANTITY = 3;
const CONFIGURABLE = {
  sku: "laptop-acer-predator-helios-neo-16-ai",
  path: "laptops/acer-predator-helios-neo-16-ai",
} as const;
const CONFIGURED_SKU = `Configuration-${CONFIGURABLE.sku}`;
const MEMORY = "Memory";
const MEMORY_OPTION = "Samsung DDR5-4800 8GB";

test.describe("cart merge (anonymous, then signing in)", () => {
  test("the anonymous cart merges into the signed-in cart", async ({ arrange, shopper, frontend, page }) => {
    const customer = await test.step("arrange: a customer and a cart of the visitor", async () => {
      await arrange.carts.cart(shopper, [{ productId: `product-${SKU}`, quantity: QUANTITY }]);
      return arrange.customers.customer();
    });
    const signIn = frontend.signIn();
    const cart = frontend.cart();
    await signIn.navigate();
    await expect(signIn.cartQuantityLabel).toHaveText(String(QUANTITY));

    await test.step(`act: sign in as ${customer.credentials.username}`, async () => {
      await signIn.signIn(customer.credentials.username, customer.credentials.password);
      await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
    });

    await test.step(`assert: the signed-in cart holds ${SKU} ×${QUANTITY}`, async () => {
      await cart.navigate();
      await expect(cart.lineItem(SKU).quantity.input).toHaveValue(String(QUANTITY));
    });
  });

  test("an anonymous configured product merges into a cart with a regular product", async ({
    arrange,
    frontend,
    page,
  }) => {
    const customer = await test.step("arrange: a customer with a cart", async () => {
      const created = await arrange.customers.customer();
      await arrange.carts.cart(created, [{ productId: `product-${SKU}`, quantity: 2 }]);
      return created;
    });
    const product = frontend.product(CONFIGURABLE.path);
    const signIn = frontend.signIn();
    const cart = frontend.cart();

    await test.step("act: add a configured product to the cart as the visitor", async () => {
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
      await expect(cart.lineItem(SKU).root).toBeVisible();
      await expect(cart.lineItem(CONFIGURED_SKU).root).toBeVisible();
    });
  });
});
