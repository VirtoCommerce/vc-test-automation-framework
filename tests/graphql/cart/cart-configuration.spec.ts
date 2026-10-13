import * as allure from "allure-js-commons";

import { ChangeCartConfiguredItemDocument, RemoveCartItemDocument } from "@api/graphql/generated/graphql";
import { lineItemOf } from "@api/graphql/line-items";
import { requireDefined } from "@core/required-fields";
import { configuredSku, LAST_OPTION, optionOfEachSection } from "@dataset/builders/product-configuration";
import { expect, test } from "@fixtures";

const CONFIGURABLE_PRODUCT_ID = "product-laptop-acer-predator-helios-neo-16-ai";

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Cart / Configurable Product");
});

test.describe("configurable products in the cart (anonymous)", () => {
  test("add a configured product", async ({ api, arrange, dataset }) => {
    await allure.story("Configured line item");
    await allure.description(
      "A configurable product added with one option of each section becomes one configured line item " +
        "with the selected components.",
    );
    const selection = optionOfEachSection(await arrange.catalog.productConfiguration(api, CONFIGURABLE_PRODUCT_ID));

    const cart = await test.step("act: add the product with the first option of each section", () =>
      arrange.carts.cart(api, [{ productId: CONFIGURABLE_PRODUCT_ID, quantity: 1 }], {
        configurationSections: selection,
      }));

    await test.step("assert: one configured line item holds the selected components", () => {
      const line = lineItemOf(cart, CONFIGURABLE_PRODUCT_ID);
      const components = requireDefined(line.configurationItems, "Configuration item");
      expect(cart.itemsCount).toBe(1);
      expect(line.sku).toBe(configuredSku(String(dataset.products.get(CONFIGURABLE_PRODUCT_ID).code)));
      expect(new Set(components.map((item) => item.productId))).toEqual(
        new Set(selection.map(({ option }) => option?.productId)),
      );
      for (const component of components) {
        expect(component).toMatchObject({ sectionId: expect.any(String), name: expect.any(String) });
      }
    });
  });

  test("change the configuration of a line item", async ({ api, arrange }) => {
    await allure.story("Configured line item");
    await allure.description("Changing the components of a configured line item keeps the same line.");
    const configuration = await arrange.catalog.productConfiguration(api, CONFIGURABLE_PRODUCT_ID);
    const firstOptions = optionOfEachSection(configuration);
    const lastOptions = optionOfEachSection(configuration, LAST_OPTION);
    const cart = await test.step("arrange: cart with the first option of each section", () =>
      arrange.carts.cart(api, [{ productId: CONFIGURABLE_PRODUCT_ID, quantity: 1 }], {
        configurationSections: firstOptions,
      }));
    const line = lineItemOf(cart, CONFIGURABLE_PRODUCT_ID);

    const { changeCartConfiguredItem } = await test.step("act: switch to the last option of each section", async () =>
      api.graphql.execute(ChangeCartConfiguredItemDocument, {
        command: {
          ...(await api.storeContext()),
          cartId: cart.id,
          lineItemId: line.id,
          configurationSections: lastOptions,
        },
      }));

    await test.step("assert: the same line item holds the new components", () => {
      const changed = lineItemOf(changeCartConfiguredItem, CONFIGURABLE_PRODUCT_ID);
      const components = new Set(changed.configurationItems?.map((item) => item?.productId));
      expect(changeCartConfiguredItem?.itemsCount).toBe(1);
      expect(changed.id).toBe(line.id);
      expect(components).toEqual(new Set(lastOptions.map(({ option }) => option?.productId)));
      expect(components).not.toEqual(new Set(firstOptions.map(({ option }) => option?.productId)));
    });
  });

  test("remove a configured line item", async ({ api, arrange }) => {
    await allure.story("Configured line item");
    await allure.description("Removing the only configured line item leaves an empty cart.");
    const selection = optionOfEachSection(await arrange.catalog.productConfiguration(api, CONFIGURABLE_PRODUCT_ID));
    const cart = await test.step("arrange: cart with a configured product", () =>
      arrange.carts.cart(api, [{ productId: CONFIGURABLE_PRODUCT_ID, quantity: 1 }], {
        configurationSections: selection,
      }));

    const { removeCartItem } = await test.step("act: remove the configured line item", async () =>
      api.graphql.execute(RemoveCartItemDocument, {
        command: {
          ...(await api.storeContext()),
          cartId: cart.id,
          lineItemId: lineItemOf(cart, CONFIGURABLE_PRODUCT_ID).id,
        },
      }));

    await test.step("assert: the cart is empty", () => {
      expect(removeCartItem).toMatchObject({ itemsCount: 0, items: [] });
    });
  });
});
