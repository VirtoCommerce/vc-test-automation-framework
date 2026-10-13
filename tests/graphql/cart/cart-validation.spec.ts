import * as allure from "allure-js-commons";

import {
  AddItemsCartDocument,
  GetCartLineValidationDocument,
  GetCartValidationAliasedDocument,
  GetCartValidationDocument,
  RemoveCartItemDocument,
  UpdateCartQuantityDocument,
} from "@api/graphql/generated/graphql";
import { lineItemOf } from "@api/graphql/line-items";
import { expect, test } from "@fixtures";

const PRODUCT_ID = "product-smartphone-apple-iphone-17-256gb-black";
const SIBLING_PRODUCT_ID = "product-smartphone-apple-iphone-17-256gb-sage";
const OVER_STOCK = 500_000;
const QUANTITY_CHANGED = "PRODUCT_QTY_CHANGED";
const QUANTITY_ERROR_CODES: readonly (string | null)[] = [QUANTITY_CHANGED, "PRODUCT_QTY_INSUFFICIENT"];

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Cart / Validation");
});

test.describe("cart validation (anonymous)", () => {
  test("a valid sibling line stays valid next to an over-stock line", async ({ api, arrange }) => {
    await allure.story("Line validation");
    await allure.description(
      "Pushing one line over stock makes only that line invalid, with a quantity error pointing at it.",
    );
    const cart = await test.step("arrange: cart with two valid lines", () =>
      arrange.carts.cart(api, [
        { productId: PRODUCT_ID, quantity: 1 },
        { productId: SIBLING_PRODUCT_ID, quantity: 2 },
      ]));
    const context = await api.storeContext();

    await test.step(`act: set one line to ${OVER_STOCK}`, () =>
      api.graphql.execute(UpdateCartQuantityDocument, {
        command: { ...context, cartId: cart.id, items: [{ productId: PRODUCT_ID, quantity: OVER_STOCK }] },
      }));

    await test.step("assert: only the over-stock line is invalid, with a quantity error on that line", async () => {
      const { cart: lines } = await api.graphql.execute(GetCartLineValidationDocument, { ...context, cartId: cart.id });
      const overStock = lineItemOf(lines, PRODUCT_ID);
      expect(overStock.isValid).toBe(false);
      expect(overStock.validationErrors).toEqual([
        expect.objectContaining({ errorCode: QUANTITY_CHANGED, objectType: "LineItem", objectId: overStock.id }),
      ]);
      expect(lineItemOf(lines, SIBLING_PRODUCT_ID)).toMatchObject({ isValid: true, validationErrors: [] });
    });
  });

  test("line errors persist after another cart change", async ({ api, arrange }) => {
    await allure.story("Line validation");
    await allure.description("An over-stock line stays invalid when another product is added to the cart.");
    const cart = await test.step("arrange: cart with an over-stock line", () =>
      arrange.carts.cart(api, [{ productId: PRODUCT_ID, quantity: 1 }]));
    const context = await api.storeContext();
    await test.step(`arrange: set the line to ${OVER_STOCK}`, () =>
      api.graphql.execute(UpdateCartQuantityDocument, {
        command: { ...context, cartId: cart.id, items: [{ productId: PRODUCT_ID, quantity: OVER_STOCK }] },
      }));

    await test.step("act: add a valid sibling line", () =>
      api.graphql.execute(AddItemsCartDocument, {
        command: { ...context, cartId: cart.id, cartItems: [{ productId: SIBLING_PRODUCT_ID, quantity: 2 }] },
      }));

    await test.step("assert: the over-stock line is still invalid with its quantity error", async () => {
      const { cart: lines } = await api.graphql.execute(GetCartLineValidationDocument, { ...context, cartId: cart.id });
      const overStock = lineItemOf(lines, PRODUCT_ID);
      expect(overStock.isValid).toBe(false);
      expect(overStock.validationErrors).toEqual([
        expect.objectContaining({ errorCode: QUANTITY_CHANGED, objectType: "LineItem", objectId: overStock.id }),
      ]);
    });
  });

  test("cart validation errors are scoped by rule set", async ({ api, arrange }) => {
    await allure.story("Rule sets");
    await allure.description(
      'Only the "*" and "items" rule sets report a quantity error. Other rule sets, each read in its own ' +
        'request, report none while the line stays invalid, and do not change what "*" reports afterwards.',
    );
    const cart = await test.step("arrange: cart with an over-stock line", () =>
      arrange.carts.cart(api, [{ productId: PRODUCT_ID, quantity: 1 }]));
    const context = await api.storeContext();
    await test.step(`arrange: set the line to ${OVER_STOCK}`, () =>
      api.graphql.execute(UpdateCartQuantityDocument, {
        command: { ...context, cartId: cart.id, items: [{ productId: PRODUCT_ID, quantity: OVER_STOCK }] },
      }));

    for (const ruleSet of ["*", "items"]) {
      await test.step(`assert: rule set "${ruleSet}" reports the quantity error`, async () => {
        const { cart: validation } = await api.graphql.execute(GetCartValidationDocument, {
          ...context,
          cartId: cart.id,
          ruleSet,
        });
        expect(validation?.validationErrors?.map((error) => error?.errorCode)).toEqual([QUANTITY_CHANGED]);
      });
    }
    for (const ruleSet of ["default", "shipments", "foo"]) {
      await test.step(`assert: rule set "${ruleSet}" has no quantity error but the line stays invalid`, async () => {
        const { cart: validation } = await api.graphql.execute(GetCartValidationDocument, {
          ...context,
          cartId: cart.id,
          ruleSet,
        });
        const codes = validation?.validationErrors?.map((error) => error?.errorCode ?? null) ?? [];
        expect(codes.filter((code) => QUANTITY_ERROR_CODES.includes(code))).toEqual([]);
        expect(lineItemOf(validation, PRODUCT_ID).isValid).toBe(false);
      });
    }
    await test.step('assert: after the other rule sets, "*" still reports the quantity error', async () => {
      const { cart: validation } = await api.graphql.execute(GetCartValidationDocument, {
        ...context,
        cartId: cart.id,
        ruleSet: "*",
      });
      expect(validation?.validationErrors?.map((error) => error?.errorCode)).toEqual([QUANTITY_CHANGED]);
    });
  });

  test("rule sets stay isolated within one request", async ({ api, arrange }) => {
    await allure.story("Rule sets");
    await allure.description("Two rule sets read in one request do not affect each other's errors.");
    const cart = await test.step("arrange: cart with an over-stock line", () =>
      arrange.carts.cart(api, [{ productId: PRODUCT_ID, quantity: 1 }]));
    const context = await api.storeContext();
    await test.step(`arrange: set the line to ${OVER_STOCK}`, () =>
      api.graphql.execute(UpdateCartQuantityDocument, {
        command: { ...context, cartId: cart.id, items: [{ productId: PRODUCT_ID, quantity: OVER_STOCK }] },
      }));

    await test.step('assert: "*" then "shipments" in one request: only "*" has the error', async () => {
      const { cart: aliased } = await api.graphql.execute(GetCartValidationAliasedDocument, {
        ...context,
        cartId: cart.id,
        ruleSetA: "*",
        ruleSetB: "shipments",
      });
      expect(aliased?.errorsA?.map((error) => error?.errorCode)).toEqual([QUANTITY_CHANGED]);
      expect(aliased?.errorsB?.filter((error) => QUANTITY_ERROR_CODES.includes(error?.errorCode ?? null))).toEqual([]);
    });
    await test.step('assert: "foo" then "*" in one request: "foo" does not affect "*"', async () => {
      const { cart: aliased } = await api.graphql.execute(GetCartValidationAliasedDocument, {
        ...context,
        cartId: cart.id,
        ruleSetA: "foo",
        ruleSetB: "*",
      });
      expect(aliased?.errorsA).toEqual([]);
      expect(aliased?.errorsB?.map((error) => error?.errorCode)).toEqual([QUANTITY_CHANGED]);
    });
  });

  test("validation errors clear after the quantity is corrected", async ({ api, arrange }) => {
    await allure.story("Line validation");
    await allure.description("Correcting an over-stock quantity clears the cart's and the line's errors.");
    const cart = await test.step("arrange: cart with an over-stock line", () =>
      arrange.carts.cart(api, [{ productId: PRODUCT_ID, quantity: 1 }]));
    const context = await api.storeContext();
    await test.step(`arrange: set the line to ${OVER_STOCK}`, () =>
      api.graphql.execute(UpdateCartQuantityDocument, {
        command: { ...context, cartId: cart.id, items: [{ productId: PRODUCT_ID, quantity: OVER_STOCK }] },
      }));

    await test.step("act: correct the quantity to 1", () =>
      api.graphql.execute(UpdateCartQuantityDocument, {
        command: { ...context, cartId: cart.id, items: [{ productId: PRODUCT_ID, quantity: 1 }] },
      }));

    await test.step("assert: neither the cart nor the line has an error", async () => {
      const { cart: validation } = await api.graphql.execute(GetCartValidationDocument, {
        ...context,
        cartId: cart.id,
        ruleSet: "*",
      });
      const codes = validation?.validationErrors?.map((error) => error?.errorCode ?? null) ?? [];
      expect(codes.filter((code) => QUANTITY_ERROR_CODES.includes(code))).toEqual([]);
      expect(lineItemOf(validation, PRODUCT_ID)).toMatchObject({ isValid: true, validationErrors: [] });
    });
  });

  test("validation errors clear after the over-stock line is removed", async ({ api, arrange }) => {
    await allure.story("Line validation");
    await allure.description("Removing the over-stock line clears the cart's quantity error.");
    const cart = await test.step("arrange: cart with an over-stock line", () =>
      arrange.carts.cart(api, [{ productId: PRODUCT_ID, quantity: 1 }]));
    const context = await api.storeContext();
    await test.step(`arrange: set the line to ${OVER_STOCK}`, () =>
      api.graphql.execute(UpdateCartQuantityDocument, {
        command: { ...context, cartId: cart.id, items: [{ productId: PRODUCT_ID, quantity: OVER_STOCK }] },
      }));

    await test.step("act: remove the over-stock line", () =>
      api.graphql.execute(RemoveCartItemDocument, {
        command: { ...context, cartId: cart.id, lineItemId: lineItemOf(cart, PRODUCT_ID).id },
      }));

    await test.step("assert: the cart has no quantity error and no such line", async () => {
      const { cart: validation } = await api.graphql.execute(GetCartValidationDocument, {
        ...context,
        cartId: cart.id,
        ruleSet: "*",
      });
      const codes = validation?.validationErrors?.map((error) => error?.errorCode ?? null) ?? [];
      expect(codes.filter((code) => QUANTITY_ERROR_CODES.includes(code))).toEqual([]);
      expect(validation?.items?.map((item) => item?.productId)).not.toContain(PRODUCT_ID);
    });
  });
});
