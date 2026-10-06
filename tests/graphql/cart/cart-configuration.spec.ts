import type { GraphqlClient } from "@api/graphql/graphql-client";
import type { FrontendContext } from "@dataset/frontend-context";

import * as allure from "allure-js-commons";

import { ChangeCartConfiguredItemDocument, RemoveCartItemDocument } from "@api/graphql/generated/graphql";
import { requireItems } from "@core/required-fields";
import { arrangeCart, cartScope, lineItemFor } from "@dataset/arrange/cart";
import { getProductConfiguration } from "@dataset/arrange/catalog";
import { configuredSku, LAST_OPTION, optionOfEachSection } from "@dataset/builders/product-configuration";
import { SEEDED_PRODUCTS } from "@dataset/seeded";
import { expect, test } from "@fixtures";

const CONFIGURABLE_PRODUCT_ID = SEEDED_PRODUCTS.configurableLaptop;
const CONFIGURED_SKU = configuredSku(CONFIGURABLE_PRODUCT_ID);

test.beforeEach(async () => {
  await allure.feature("Cart / Configurable Product");
});

test.describe("configurable products in the cart (anonymous)", () => {
  test("add a configured product", async ({ graphqlClient, cleanupStack, frontendContext }) => {
    const selection = optionOfEachSection(await getConfiguration(graphqlClient, frontendContext));

    const cart = await test.step("act: add the product with the first option of each section", () =>
      arrangeCart(graphqlClient, cleanupStack, frontendContext, [{ productId: CONFIGURABLE_PRODUCT_ID, quantity: 1 }], {
        configurationSections: selection,
      }));

    await test.step("assert: a configured line item has the selected components", async () => {
      const lineItem = lineItemFor(cart, CONFIGURABLE_PRODUCT_ID);
      expect(cart.itemsCount).toBe(1);
      expect(lineItem.sku).toBe(CONFIGURED_SKU);
      const configurationItems = requireItems(lineItem.configurationItems, "Configuration items");
      expect(new Set(configurationItems.map((item) => item.productId))).toEqual(selectedProductIds(selection));
      for (const item of configurationItems) {
        expect(item).toMatchObject({ sectionId: expect.any(String), name: expect.any(String) });
      }
    });
  });

  test("change the configuration of a line item", async ({ graphqlClient, cleanupStack, frontendContext }) => {
    const configuration = await getConfiguration(graphqlClient, frontendContext);
    const firstSelection = optionOfEachSection(configuration);
    const lastSelection = optionOfEachSection(configuration, LAST_OPTION);
    const cart = await test.step("arrange: cart with the first option of each section", () =>
      arrangeCart(graphqlClient, cleanupStack, frontendContext, [{ productId: CONFIGURABLE_PRODUCT_ID, quantity: 1 }], {
        configurationSections: firstSelection,
      }));
    const lineItem = lineItemFor(cart, CONFIGURABLE_PRODUCT_ID);

    const { changeCartConfiguredItem } = await test.step("act: switch to the last option of each section", () =>
      graphqlClient.execute(ChangeCartConfiguredItemDocument, {
        command: {
          ...cartScope(frontendContext),
          cartId: cart.id,
          lineItemId: lineItem.id,
          configurationSections: lastSelection,
        },
      }));

    await test.step("assert: the same line item has the new components", async () => {
      const changedItem = lineItemFor(changeCartConfiguredItem, CONFIGURABLE_PRODUCT_ID);
      const changedIds = new Set(changedItem.configurationItems?.map((item) => item?.productId));
      expect(changeCartConfiguredItem?.itemsCount).toBe(1);
      expect(changedItem.id).toBe(lineItem.id);
      expect(changedIds).toEqual(selectedProductIds(lastSelection));
      expect(changedIds).not.toEqual(selectedProductIds(firstSelection));
    });
  });

  test("remove a configured line item", async ({ graphqlClient, cleanupStack, frontendContext }) => {
    const selection = optionOfEachSection(await getConfiguration(graphqlClient, frontendContext));
    const cart = await test.step("arrange: cart with a configured product", () =>
      arrangeCart(graphqlClient, cleanupStack, frontendContext, [{ productId: CONFIGURABLE_PRODUCT_ID, quantity: 1 }], {
        configurationSections: selection,
      }));

    const { removeCartItem } = await test.step("act: remove the configured line item", () =>
      graphqlClient.execute(RemoveCartItemDocument, {
        command: {
          ...cartScope(frontendContext),
          cartId: cart.id,
          lineItemId: lineItemFor(cart, CONFIGURABLE_PRODUCT_ID).id,
        },
      }));

    await test.step("assert: cart is empty", async () => {
      expect(removeCartItem).toMatchObject({ itemsCount: 0, items: [] });
    });
  });
});

async function getConfiguration(graphqlClient: GraphqlClient, context: FrontendContext) {
  const configuration = await test.step(`arrange: configuration of ${CONFIGURABLE_PRODUCT_ID}`, () =>
    getProductConfiguration(graphqlClient, context, CONFIGURABLE_PRODUCT_ID));
  expect(configuration.configurationSections.length).toBeGreaterThan(0);
  return configuration;
}

function selectedProductIds(selection: ReturnType<typeof optionOfEachSection>): Set<string | undefined> {
  return new Set(selection.map(({ option }) => option?.productId));
}
