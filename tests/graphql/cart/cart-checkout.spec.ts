import type { Dataset } from "@dataset/dataset";

import * as allure from "allure-js-commons";

import {
  AddOrUpdateCartPaymentDocument,
  AddOrUpdateCartShipmentDocument,
  CreateOrderFromCartDocument,
} from "@api/graphql/generated/graphql";
import { requireFields } from "@core/required-fields";
import { comparableAddress, TEST_ADDRESS } from "@dataset/builders/address";
import { expect, test } from "@fixtures";

const PRODUCT_ID = "product-smartphone-apple-iphone-17-256gb-black";
const MANUAL_PAYMENT = "DefaultManualPaymentMethod";
const AUTHORIZE_NET_PAYMENT = "AuthorizeNetPaymentMethod";
const FIXED_RATE = "FixedRate";
const WRONG_SHIPPING_PRICE = 1;
const VALIDATION = "VALIDATION";
const CHANGED_ADDRESS = { ...TEST_ADDRESS, line1: "Change St 123" };
const SHIPMENT_PRICES = [
  { method: "BuyOnlinePickupInStore", option: "Pickup", price: (_dataset: Dataset) => 0 },
  {
    method: FIXED_RATE,
    option: "Ground",
    price: (dataset: Dataset) =>
      Number(
        dataset.shippingMethods
          .filter(({ code }) => code === FIXED_RATE)[0]
          ?.settings?.find(({ name }) => name?.endsWith(".Ground.Rate"))?.value,
      ),
  },
  {
    method: FIXED_RATE,
    option: "Air",
    price: (dataset: Dataset) =>
      Number(
        dataset.shippingMethods
          .filter(({ code }) => code === FIXED_RATE)[0]
          ?.settings?.find(({ name }) => name?.endsWith(".Air.Rate"))?.value,
      ),
  },
] as const;

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Cart / Checkout");
});

test.describe("cart checkout (anonymous)", () => {
  test("add and change the payment of a cart", async ({ api, arrange }) => {
    await allure.story("Payment");
    await allure.description("A payment added to a cart can be changed to another method and billing address.");
    const cart = await test.step("arrange: cart with a product ×3", () =>
      arrange.carts.cart(api, [{ productId: PRODUCT_ID, quantity: 3 }]));
    const command = { ...(await api.storeContext()), cartId: cart.id };

    const { addOrUpdateCartPayment: added } = await test.step(`act: add a ${MANUAL_PAYMENT} payment`, () =>
      api.graphql.execute(AddOrUpdateCartPaymentDocument, {
        command: { ...command, payment: { paymentGatewayCode: MANUAL_PAYMENT, billingAddress: TEST_ADDRESS } },
      }));
    const payment = requireFields(added?.payments?.[0], ["id"], "Cart payment");
    await test.step("assert: the payment has the method and billing address", () => {
      expect(added?.payments).toHaveLength(1);
      expect(payment).toMatchObject({
        paymentGatewayCode: MANUAL_PAYMENT,
        billingAddress: comparableAddress(TEST_ADDRESS),
      });
    });

    const { addOrUpdateCartPayment: changed } =
      await test.step(`act: change the payment to ${AUTHORIZE_NET_PAYMENT}`, () =>
        api.graphql.execute(AddOrUpdateCartPaymentDocument, {
          command: {
            ...command,
            payment: { id: payment.id, paymentGatewayCode: AUTHORIZE_NET_PAYMENT, billingAddress: CHANGED_ADDRESS },
          },
        }));
    await test.step("assert: the same payment has the new method and address", () => {
      expect(changed?.payments).toEqual([
        expect.objectContaining({
          id: payment.id,
          paymentGatewayCode: AUTHORIZE_NET_PAYMENT,
          billingAddress: expect.objectContaining(comparableAddress(CHANGED_ADDRESS)),
        }),
      ]);
    });
  });

  test("add and change the shipment of a cart", async ({ api, arrange }) => {
    await allure.story("Shipment");
    await allure.description("A shipment added to a cart can be changed to another option, price and address.");
    const cart = await test.step("arrange: cart with a product ×3", () =>
      arrange.carts.cart(api, [{ productId: PRODUCT_ID, quantity: 3 }]));
    const command = { ...(await api.storeContext()), cartId: cart.id };

    const { addOrUpdateCartShipment: added } = await test.step("act: add a Ground shipment", () =>
      api.graphql.execute(AddOrUpdateCartShipmentDocument, {
        command: {
          ...command,
          shipment: {
            shipmentMethodCode: FIXED_RATE,
            shipmentMethodOption: "Ground",
            price: 15,
            deliveryAddress: TEST_ADDRESS,
          },
        },
      }));
    const shipment = requireFields(added?.shipments?.[0], ["id"], "Cart shipment");
    await test.step("assert: the shipment has the method, price and delivery address", () => {
      expect(added?.shipments).toHaveLength(1);
      expect(shipment).toMatchObject({
        shipmentMethodCode: FIXED_RATE,
        shipmentMethodOption: "Ground",
        price: { amount: 15 },
        deliveryAddress: comparableAddress(TEST_ADDRESS),
      });
    });

    const { addOrUpdateCartShipment: changed } = await test.step("act: change the shipment to Air", () =>
      api.graphql.execute(AddOrUpdateCartShipmentDocument, {
        command: {
          ...command,
          shipment: {
            id: shipment.id,
            shipmentMethodCode: FIXED_RATE,
            shipmentMethodOption: "Air",
            price: 25,
            deliveryAddress: CHANGED_ADDRESS,
          },
        },
      }));
    await test.step("assert: the same shipment has the new option, price and address", () => {
      expect(changed?.shipments).toEqual([
        expect.objectContaining({
          id: shipment.id,
          shipmentMethodOption: "Air",
          price: expect.objectContaining({ amount: 25 }),
          deliveryAddress: expect.objectContaining(comparableAddress(CHANGED_ADDRESS)),
        }),
      ]);
    });
  });

  test("create an order from a cart", async ({ api, arrange }) => {
    await allure.story("Order");
    await allure.description("A cart with a payment and a shipment becomes an order with the same item.");
    const cart = await test.step("arrange: cart with a product ×2", () =>
      arrange.carts.cart(api, [{ productId: PRODUCT_ID, quantity: 2 }]));
    const command = { ...(await api.storeContext()), cartId: cart.id };
    await test.step("arrange: a manual payment and a Ground shipment", async () => {
      await api.graphql.execute(AddOrUpdateCartPaymentDocument, {
        command: {
          ...command,
          payment: { paymentGatewayCode: MANUAL_PAYMENT, billingAddress: TEST_ADDRESS, price: 0 },
        },
      });
      await api.graphql.execute(AddOrUpdateCartShipmentDocument, {
        command: {
          ...command,
          shipment: {
            shipmentMethodCode: FIXED_RATE,
            shipmentMethodOption: "Ground",
            price: 15,
            deliveryAddress: TEST_ADDRESS,
          },
        },
      });
    });

    const { createOrderFromCart } = await test.step("act: create an order from the cart", () =>
      api.graphql.execute(CreateOrderFromCartDocument, { command: { cartId: cart.id } }));
    const order = requireFields(createOrderFromCart, ["id", "number"], "Created order");
    arrange.orders.deleteOrderLater(order.id);

    await test.step("assert: the order has the cart item, the payment and the shipment", () => {
      expect(order.items).toEqual([expect.objectContaining({ productId: PRODUCT_ID, quantity: 2 })]);
      expect(order.inPayments).toEqual([expect.objectContaining({ gatewayCode: MANUAL_PAYMENT })]);
      expect(order.shipments).toEqual([
        expect.objectContaining({ shipmentMethodCode: FIXED_RATE, shipmentMethodOption: "Ground" }),
      ]);
    });
  });
});

test.describe("cart checkout (customer of their own)", () => {
  for (const { method, option, price } of SHIPMENT_PRICES) {
    test(`shipping total follows the ${method} ${option} rate`, async ({ arrange, dataset }) => {
      const rate = price(dataset);
      await allure.story("Shipment");
      await allure.description(
        `Selecting ${method} ${option} at its dataset rate, ${rate}, makes that rate the cart's shipping total.`,
      );
      const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
      const cart = await test.step("arrange: cart with a product", () =>
        arrange.carts.cart(customer.api, [{ productId: PRODUCT_ID, quantity: 1 }]));
      await test.step("assert: the cart has no shipping cost yet", () => {
        expect(cart.shippingTotal?.amount).toBe(0);
      });

      const { addOrUpdateCartShipment } = await test.step(`act: select ${method} ${option}`, async () =>
        customer.api.graphql.execute(AddOrUpdateCartShipmentDocument, {
          command: {
            ...(await customer.api.storeContext()),
            cartId: cart.id,
            shipment: { shipmentMethodCode: method, shipmentMethodOption: option, price: rate },
          },
        }));

      await test.step(`assert: the shipping total is ${rate}`, () => {
        expect(addOrUpdateCartShipment?.shippingTotal?.amount).toBe(rate);
      });
    });
  }

  test("a shipment priced off its rate is rejected", async ({ arrange }) => {
    await allure.story("Shipment");
    await allure.description(`A ${FIXED_RATE} Ground shipment at a price other than its rate fails validation.`);
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
    const cart = await test.step("arrange: cart with a product", () =>
      arrange.carts.cart(customer.api, [{ productId: PRODUCT_ID, quantity: 1 }]));

    const selected = test.step(`act: select ${FIXED_RATE} Ground at ${WRONG_SHIPPING_PRICE}`, async () =>
      customer.api.graphql.execute(AddOrUpdateCartShipmentDocument, {
        command: {
          ...(await customer.api.storeContext()),
          cartId: cart.id,
          shipment: { shipmentMethodCode: FIXED_RATE, shipmentMethodOption: "Ground", price: WRONG_SHIPPING_PRICE },
        },
      }));

    await test.step("assert: the shipment fails validation", async () => {
      await expect(selected).rejects.toBeGraphqlError(VALIDATION);
    });
  });
});
