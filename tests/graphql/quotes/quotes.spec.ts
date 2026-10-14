import * as allure from "allure-js-commons";

import {
  ChangeQuoteCommentDocument,
  ChangeQuoteItemQuantityDocument,
  CreateQuoteDocument,
  GetQuoteDocument,
  RemoveQuoteItemDocument,
  SubmitQuoteRequestDocument,
  UpdateQuoteAddressesDocument,
} from "@api/graphql/generated/graphql";
import { lineItemOf } from "@api/graphql/line-items";
import { requireFields } from "@core/required-fields";
import { MODULES } from "@dataset/modules";
import { expect, test } from "@fixtures";

const PRODUCT_ID = "product-smartphone-apple-iphone-17-256gb-black";
const SECOND_PRODUCT_ID = "product-sodimm-crucial-ddr4-2400-8gb";
const SHIPPING = 1;
const BILLING = 2;
const QUOTE_ADDRESS = {
  city: "Springfield",
  countryCode: "USA",
  countryName: "United States of America",
  line1: "742 Evergreen Terrace",
  postalCode: "62704",
  regionId: "IL",
  regionName: "Illinois",
};

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Quotes");
});

test.describe("quotes (customer of their own)", () => {
  test.use({ requiresModules: [MODULES.quote] });

  test("create an empty quote", async ({ arrange }) => {
    await allure.story("Create");
    await allure.description("A customer creates an empty quote in the store.");
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
    const context = await customer.api.storeContext();

    const { createQuote } = await test.step("act: create a quote", () =>
      customer.api.graphql.execute(CreateQuoteDocument, { command: context }));
    const quote = requireFields(createQuote, ["id"], "Created quote");
    arrange.orders.deleteQuoteLater(quote.id);

    await test.step("assert: the quote is empty and belongs to the store", () => {
      expect(quote).toMatchObject({ storeId: context.storeId, items: [] });
    });
  });

  test("create a quote from a cart", async ({ arrange }) => {
    await allure.story("Create");
    await allure.description("A quote requested from a cart carries the cart's item.");
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
    const cart = await test.step("arrange: cart with a product ×2", () =>
      arrange.carts.cart(customer.api, [{ productId: PRODUCT_ID, quantity: 2 }]));

    const quote = await test.step("act: create a quote from the cart", () =>
      arrange.orders.quoteFromCart(customer.api, cart.id));

    await test.step("assert: the quote carries the cart's item", async () => {
      expect(quote.storeId).toBe((await customer.api.storeContext()).storeId);
      expect(quote.items).toEqual([expect.objectContaining({ productId: PRODUCT_ID, quantity: 2 })]);
    });
  });

  test("change the quantity of a quote item", async ({ arrange }) => {
    await allure.story("Edit");
    await allure.description("A new quantity of a quote item gets a proposal price for that quantity.");
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
    const cart = await test.step("arrange: cart with a product", () =>
      arrange.carts.cart(customer.api, [{ productId: PRODUCT_ID, quantity: 1 }]));
    const quote = await test.step("arrange: quote from the cart", () =>
      arrange.orders.quoteFromCart(customer.api, cart.id));

    const { changeQuoteItemQuantity } = await test.step("act: change the item quantity to 5", () =>
      customer.api.graphql.execute(ChangeQuoteItemQuantityDocument, {
        command: { quoteId: quote.id, lineItemId: lineItemOf(quote, PRODUCT_ID).id, quantity: 5 },
      }));

    await test.step("assert: the item has a proposal price for 5 units", () => {
      expect(lineItemOf(changeQuoteItemQuantity, PRODUCT_ID).proposalPrices?.map((price) => price?.quantity)).toContain(
        5,
      );
    });
  });

  test("change the comment of a quote", async ({ arrange }) => {
    await allure.story("Edit");
    await allure.description("A quote's comment can be changed.");
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
    const cart = await test.step("arrange: cart with a product", () =>
      arrange.carts.cart(customer.api, [{ productId: PRODUCT_ID, quantity: 1 }]));
    const quote = await test.step("arrange: quote from the cart", () =>
      arrange.orders.quoteFromCart(customer.api, cart.id));

    const { changeQuoteComment } = await test.step("act: change the comment", () =>
      customer.api.graphql.execute(ChangeQuoteCommentDocument, {
        command: { quoteId: quote.id, comment: "Updated comment" },
      }));

    await test.step("assert: the quote has the new comment", () => {
      expect(changeQuoteComment?.comment).toBe("Updated comment");
    });
  });

  test("set the shipping and billing addresses of a quote", async ({ arrange }) => {
    await allure.story("Edit");
    await allure.description("A quote stores exactly the shipping and billing address it was given.");
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
    const cart = await test.step("arrange: cart with a product", () =>
      arrange.carts.cart(customer.api, [{ productId: PRODUCT_ID, quantity: 1 }]));
    const quote = await test.step("arrange: quote from the cart", () =>
      arrange.orders.quoteFromCart(customer.api, cart.id));
    const addresses = [SHIPPING, BILLING].map((addressType) => ({ ...QUOTE_ADDRESS, addressType }));

    await test.step("act: set a shipping and a billing address", () =>
      customer.api.graphql.execute(UpdateQuoteAddressesDocument, { command: { quoteId: quote.id, addresses } }));

    await test.step("assert: the stored quote has exactly those two addresses", async () => {
      const { quote: stored } = await customer.api.graphql.execute(GetQuoteDocument, {
        ...(await customer.api.storeContext()),
        id: quote.id,
      });
      expect(stored?.addresses).toEqual(
        expect.arrayContaining(addresses.map((address) => expect.objectContaining(address))),
      );
      expect(stored?.addresses).toHaveLength(addresses.length);
    });
  });

  test("remove an item from a draft quote", async ({ arrange }) => {
    await allure.story("Edit");
    await allure.description("Removing one item of a draft quote leaves the other in the draft.");
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
    const cart = await test.step("arrange: cart with two products", () =>
      arrange.carts.cart(customer.api, [
        { productId: PRODUCT_ID, quantity: 1 },
        { productId: SECOND_PRODUCT_ID, quantity: 1 },
      ]));
    const quote = await test.step("arrange: quote from the cart", () =>
      arrange.orders.quoteFromCart(customer.api, cart.id));

    const { removeQuoteItem } = await test.step(`act: remove ${PRODUCT_ID}`, () =>
      customer.api.graphql.execute(RemoveQuoteItemDocument, {
        command: { quoteId: quote.id, lineItemId: lineItemOf(quote, PRODUCT_ID).id },
      }));

    await test.step("assert: only the other product is left in the draft", () => {
      expect(removeQuoteItem?.status).toBe("Draft");
      expect(removeQuoteItem?.items).toEqual([expect.objectContaining({ productId: SECOND_PRODUCT_ID })]);
    });
  });

  test("submit a quote request", async ({ arrange }) => {
    await allure.story("Submit");
    await allure.description("Submitting a draft quote moves it to processing.");
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
    const cart = await test.step("arrange: cart with a product", () =>
      arrange.carts.cart(customer.api, [{ productId: PRODUCT_ID, quantity: 1 }]));
    const quote = await test.step("arrange: quote from the cart", () =>
      arrange.orders.quoteFromCart(customer.api, cart.id));

    const { submitQuoteRequest } = await test.step("act: submit the quote", () =>
      customer.api.graphql.execute(SubmitQuoteRequestDocument, {
        command: { quoteId: quote.id, comment: "Submitted by an automated test" },
      }));

    await test.step("assert: the quote moved from draft to processing", () => {
      expect(quote.status).toBe("Draft");
      expect(submitQuoteRequest).toMatchObject({ id: quote.id, status: "Processing" });
    });
  });
});
