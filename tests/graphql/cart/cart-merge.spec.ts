import * as allure from "allure-js-commons";

import { AddItemsCartDocument, MergeCartDocument } from "@api/graphql/generated/graphql";
import { uniqueId } from "@core/unique-id";
import { arrangeCart, cartScope, lineItemFor, registerCartRemoval, requireCart } from "@dataset/arrange/cart";
import { getProductConfiguration } from "@dataset/arrange/catalog";
import { signInGraphqlClient } from "@dataset/arrange/customer-account";
import { configuredSku, optionOfEachSection } from "@dataset/builders/product-configuration";
import { getCredentials } from "@dataset/dataset";
import { getFrontendContext } from "@dataset/frontend-context";
import { SEEDED_PRODUCTS, SEEDED_USERS } from "@dataset/seeded";
import { expect, test } from "@fixtures";

const REGISTERED_USERNAME = SEEDED_USERS.storeEmployee;
const PRODUCT_IDS = [SEEDED_PRODUCTS.iphone17Black, SEEDED_PRODUCTS.iphone17MistBlue] as const;
const REGULAR_PRODUCT_ID = SEEDED_PRODUCTS.iphone17Black;
const CONFIGURABLE_PRODUCT_ID = SEEDED_PRODUCTS.configurableLaptop;

test.beforeEach(async () => {
  await allure.feature("Cart / Merge");
});

test.describe("cart merge (anonymous, then signed in)", () => {
  test("merge an anonymous cart into a registered user's cart", async ({
    graphqlClient,
    anonymousHttpClient,
    tokenManager,
    cleanupStack,
    frontendContext,
    dataset,
    env,
  }) => {
    const anonymousCart = await test.step("arrange: anonymous cart with two products", () =>
      arrangeCart(graphqlClient, cleanupStack, frontendContext, [
        { productId: PRODUCT_IDS[0], quantity: 2 },
        { productId: PRODUCT_IDS[1], quantity: 1 },
      ]));
    const userContext = getFrontendContext(dataset, env.storeId, REGISTERED_USERNAME, frontendContext.userId);
    const userClient = await test.step(`arrange: sign in as ${REGISTERED_USERNAME}`, () =>
      signInGraphqlClient(
        tokenManager,
        anonymousHttpClient,
        getCredentials(dataset, REGISTERED_USERNAME),
        env.storeId,
      ));
    const cartName = uniqueId("test-cart");

    const { mergeCart } = await test.step("act: merge the anonymous cart into the user's cart", () =>
      userClient.execute(MergeCartDocument, {
        command: { ...cartScope(userContext), cartName, secondCartId: anonymousCart.id },
      }));
    registerCartRemoval(userClient, cleanupStack, userContext, requireCart(mergeCart, "Merged cart").id);

    await test.step("assert: user's cart has the anonymous cart items", async () => {
      expect(mergeCart?.itemsCount).toBe(2);
      expect(lineItemFor(mergeCart, PRODUCT_IDS[0]).quantity).toBe(2);
      expect(lineItemFor(mergeCart, PRODUCT_IDS[1]).quantity).toBe(1);
    });
  });

  test("merge a cart with a configured item into a cart with a regular item", async ({
    graphqlClient,
    anonymousHttpClient,
    tokenManager,
    cleanupStack,
    frontendContext,
    dataset,
    env,
  }) => {
    const configuration = await test.step("arrange: configuration of the configurable product", () =>
      getProductConfiguration(graphqlClient, frontendContext, CONFIGURABLE_PRODUCT_ID));
    const selection = optionOfEachSection(configuration);
    const anonymousCart = await test.step("arrange: anonymous cart with the configured product", () =>
      arrangeCart(graphqlClient, cleanupStack, frontendContext, [{ productId: CONFIGURABLE_PRODUCT_ID, quantity: 1 }], {
        configurationSections: selection,
      }));
    const userContext = getFrontendContext(dataset, env.storeId, REGISTERED_USERNAME, frontendContext.userId);
    const userClient = await test.step(`arrange: sign in as ${REGISTERED_USERNAME}`, () =>
      signInGraphqlClient(
        tokenManager,
        anonymousHttpClient,
        getCredentials(dataset, REGISTERED_USERNAME),
        env.storeId,
      ));
    const cartName = uniqueId("test-cart");
    const { addItemsCart } = await test.step("arrange: user's cart with a regular product", () =>
      userClient.execute(AddItemsCartDocument, {
        command: { ...cartScope(userContext), cartName, cartItems: [{ productId: REGULAR_PRODUCT_ID, quantity: 2 }] },
      }));
    registerCartRemoval(userClient, cleanupStack, userContext, requireCart(addItemsCart, "User cart").id);

    const { mergeCart } = await test.step("act: merge the anonymous cart into the user's cart", () =>
      userClient.execute(MergeCartDocument, {
        command: { ...cartScope(userContext), cartName, secondCartId: anonymousCart.id },
      }));

    await test.step("assert: merged cart has the regular and the configured item", async () => {
      expect(mergeCart?.itemsCount).toBe(2);
      expect(lineItemFor(mergeCart, REGULAR_PRODUCT_ID).quantity).toBe(2);
      const configuredItem = lineItemFor(mergeCart, CONFIGURABLE_PRODUCT_ID);
      expect(configuredItem.sku).toBe(configuredSku(CONFIGURABLE_PRODUCT_ID));
      expect(new Set(configuredItem.configurationItems?.map((item) => item?.productId))).toEqual(
        new Set(selection.map(({ option }) => option?.productId)),
      );
    });
  });
});
