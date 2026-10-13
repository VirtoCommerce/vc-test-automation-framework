import * as allure from "allure-js-commons";

import { configuredSku } from "@dataset/builders/product-configuration";
import { expect, test } from "@fixtures";
import { isGraphqlOperation } from "@pages/selectors";

const PRODUCT = {
  code: "laptop-acer-predator-helios-neo-16-ai",
  path: "laptops/acer-predator-helios-neo-16-ai",
} as const;
const CONFIGURED_SKU = configuredSku(PRODUCT.code);
const MEMORY = "Memory";
const STORAGE = "Storage";
const MEMORY_OPTION = "Samsung DDR5-4800 8GB";
const OTHER_MEMORY_OPTION = "Crucial DDR5-4800 16GB";
const STORAGE_OPTION = "Kingston FURY Renegade G5 PCIe 5.0 NVMe M.2 SSD 1024GB";
const CONFIGURATIONS = [
  { memory: MEMORY_OPTION, badge: "1" },
  { memory: OTHER_MEMORY_OPTION, badge: "2" },
] as const;

test.beforeEach(async () => {
  await allure.epic("E2E");
  await allure.feature("Frontend / Catalog");
});

test.describe("configurable product (anonymous)", () => {
  test("configure a product and add it to the cart", async ({ frontend }) => {
    await allure.story("Product configuration");
    await allure.description(
      `${MEMORY} and ${STORAGE} are required; once chosen, the configuration has a total price and goes into ` +
        "the cart as one configured line item.",
    );
    const product = frontend.product(PRODUCT.path);
    const cart = frontend.cart();
    const memory = product.configuration.section(MEMORY);
    const storage = product.configuration.section(STORAGE);

    await test.step(`arrange: open ${PRODUCT.code}`, async () => {
      await product.navigate();
      await expect(memory.requiredMark).toHaveCount(1);
      await expect(storage.requiredMark).toHaveCount(1);
    });

    await test.step(`act: choose ${MEMORY_OPTION} and ${STORAGE_OPTION}`, async () => {
      await memory.select(MEMORY_OPTION);
      await storage.select(STORAGE_OPTION);
    });
    await test.step("assert: both sections show their choice and the configuration has a price", async () => {
      await expect(memory.selectedOptionLabel).toHaveText(MEMORY_OPTION);
      await expect(storage.selectedOptionLabel).toHaveText(STORAGE_OPTION);
      await expect(product.totalPrice).toHaveText(/\d/);
    });

    await test.step("act: add the configuration to the cart", () => product.addToCartButton.click());
    await test.step("assert: the cart holds one configured line item", async () => {
      await expect(product.cartQuantityLabel).toHaveText("1");
      await cart.navigate();
      await expect(cart.lineItems).toHaveCount(1);
      await expect(cart.lineItem(CONFIGURED_SKU).root).toBeVisible();
    });
  });

  test("two configurations of one product are separate line items", async ({ frontend }) => {
    await allure.story("Product configuration");
    await allure.description("Two memory choices of one product go into the cart as two configured line items.");
    const product = frontend.product(PRODUCT.path);
    const cart = frontend.cart();

    for (const { memory, badge } of CONFIGURATIONS) {
      await test.step(`act: add a configuration with ${memory}`, async () => {
        await product.navigate();
        await product.configuration.section(MEMORY).select(memory);
        await product.addToCartButton.click();
      });
      await test.step(`assert: the cart badge shows ${badge}`, async () => {
        await expect(product.cartQuantityLabel).toHaveText(badge);
      });
    }

    await test.step("assert: the cart has a configured line item for each memory choice", async () => {
      await cart.navigate();
      await expect(cart.lineItem(CONFIGURED_SKU).root).toHaveCount(CONFIGURATIONS.length);
      await cart.expandComponentsOf(CONFIGURED_SKU);
      for (const { memory } of CONFIGURATIONS) {
        await expect(cart.configuredLineItem(CONFIGURED_SKU, memory).root).toBeVisible();
      }
    });
  });

  test("edit a configuration from the cart", async ({ frontend, page }) => {
    await allure.story("Product configuration");
    await allure.description(
      "Editing a configured line item from the cart and updating it keeps one line item with the new choice.",
    );
    const product = frontend.product(PRODUCT.path);
    const cart = frontend.cart();
    const lineItem = cart.lineItem(CONFIGURED_SKU);
    const memory = product.configuration.section(MEMORY);

    await test.step(`arrange: the cart holds a configuration with ${MEMORY_OPTION}`, async () => {
      await product.navigate();
      await memory.select(MEMORY_OPTION);
      await product.addToCartButton.click();
      await expect(product.cartQuantityLabel).toHaveText("1");
    });

    await test.step("act: edit the configuration from its line item", async () => {
      await cart.navigate();
      await lineItem.expandComponents();
      await lineItem.editConfigurationLink.click();
    });
    await test.step(`assert: the product page shows ${MEMORY_OPTION}`, async () => {
      await expect(memory.selectedOptionLabel).toHaveText(MEMORY_OPTION);
    });

    await test.step(`act: switch to ${OTHER_MEMORY_OPTION} and update the cart`, async () => {
      await memory.select(OTHER_MEMORY_OPTION);
      await expect(memory.selectedOptionLabel).toHaveText(OTHER_MEMORY_OPTION);
      await Promise.all([
        page.waitForResponse(isGraphqlOperation("ChangeCartConfiguredItem")),
        product.updateCartButton.click(),
      ]);
    });
    await test.step(`assert: the cart has one configured line item with ${OTHER_MEMORY_OPTION}`, async () => {
      await cart.navigate();
      await expect(lineItem.root).toHaveCount(1);
      await lineItem.expandComponents();
      await expect(lineItem.root).toContainText(OTHER_MEMORY_OPTION);
      await expect(lineItem.root).not.toContainText(MEMORY_OPTION);
    });
  });
});
