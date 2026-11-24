import { comparableAddress, TEST_ADDRESS } from "@builders/address.ts";
import { dataset } from "@dataset/index.ts";
import { expect, test } from "@fixtures";
import {
  AddOrUpdateCartPaymentDocument,
  AddOrUpdateCartShipmentDocument,
  CreateOrderFromCartDocument,
} from "@graphql/generated/graphql.ts";
import { requireFields } from "@support/require-fields.ts";

const PRODUCT_ID = "product-smartphone-apple-iphone-17-256gb-black";
const MANUAL_PAYMENT = "DefaultManualPaymentMethod";
const AUTHORIZE_NET_PAYMENT = "AuthorizeNetPaymentMethod";
const FIXED_RATE = "FixedRate";
const WRONG_SHIPPING_PRICE = 1;
const VALIDATION = "VALIDATION";
const CHANGED_ADDRESS = { ...TEST_ADDRESS, line1: "Change St 123" };
const SHIPMENT_PRICES = [
  { method: "BuyOnlinePickupInStore", option: "Pickup", rate: 0 },
  { method: FIXED_RATE, option: "Ground", rate: fixedRate("Ground") },
  { method: FIXED_RATE, option: "Air", rate: fixedRate("Air") },
] as const;

test.describe("cart checkout (anonymous)", () => {
  test("add and change the payment of a cart", async ({ shopper, arrange }) => {
    const cart = await test.step("arrange: cart with a product ×3", () =>
      arrange.carts.cart(shopper, [{ productId: PRODUCT_ID, quantity: 3 }]));
    const command = { ...shopper.storeContext, cartId: cart.id };

    const { addOrUpdateCartPayment: added } = await test.step(`act: add a ${MANUAL_PAYMENT} payment`, () =>
      shopper.graphql.execute(AddOrUpdateCartPaymentDocument, {
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
        shopper.graphql.execute(AddOrUpdateCartPaymentDocument, {
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

  test("add and change the shipment of a cart", async ({ shopper, arrange }) => {
    const cart = await test.step("arrange: cart with a product ×3", () =>
      arrange.carts.cart(shopper, [{ productId: PRODUCT_ID, quantity: 3 }]));
    const command = { ...shopper.storeContext, cartId: cart.id };

    const { addOrUpdateCartShipment: added } = await test.step("act: add a Ground shipment", () =>
      shopper.graphql.execute(AddOrUpdateCartShipmentDocument, {
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
      shopper.graphql.execute(AddOrUpdateCartShipmentDocument, {
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

  test("create an order from a cart", async ({ shopper, arrange }) => {
    const cart = await test.step("arrange: cart with a product ×2", () =>
      arrange.carts.cart(shopper, [{ productId: PRODUCT_ID, quantity: 2 }]));
    const command = { ...shopper.storeContext, cartId: cart.id };
    await test.step("arrange: a manual payment and a Ground shipment", async () => {
      await shopper.graphql.execute(AddOrUpdateCartPaymentDocument, {
        command: {
          ...command,
          payment: { paymentGatewayCode: MANUAL_PAYMENT, billingAddress: TEST_ADDRESS, price: 0 },
        },
      });
      await shopper.graphql.execute(AddOrUpdateCartShipmentDocument, {
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
      shopper.graphql.execute(CreateOrderFromCartDocument, { command: { cartId: cart.id } }));
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
  test.use({ shopperAs: "customer" });

  for (const { method, option, rate } of SHIPMENT_PRICES) {
    test(`shipping total follows the ${method} ${option} rate`, async ({ shopper, arrange }) => {
      const cart = await test.step("arrange: cart with a product", () =>
        arrange.carts.cart(shopper, [{ productId: PRODUCT_ID, quantity: 1 }]));
      await test.step("assert: the cart has no shipping cost yet", () => {
        expect(cart.shippingTotal?.amount).toBe(0);
      });

      const { addOrUpdateCartShipment } = await test.step(`act: select ${method} ${option}`, () =>
        shopper.graphql.execute(AddOrUpdateCartShipmentDocument, {
          command: {
            ...shopper.storeContext,
            cartId: cart.id,
            shipment: { shipmentMethodCode: method, shipmentMethodOption: option, price: rate },
          },
        }));

      await test.step(`assert: the shipping total is ${rate}`, () => {
        expect(addOrUpdateCartShipment?.shippingTotal?.amount).toBe(rate);
      });
    });
  }

  test("a shipment priced off its rate is rejected", async ({ shopper, arrange }) => {
    const cart = await test.step("arrange: cart with a product", () =>
      arrange.carts.cart(shopper, [{ productId: PRODUCT_ID, quantity: 1 }]));

    await test.step(`act and assert: ${FIXED_RATE} Ground at ${WRONG_SHIPPING_PRICE} fails validation`, async () => {
      await expect(
        shopper.graphql.execute(AddOrUpdateCartShipmentDocument, {
          command: {
            ...shopper.storeContext,
            cartId: cart.id,
            shipment: { shipmentMethodCode: FIXED_RATE, shipmentMethodOption: "Ground", price: WRONG_SHIPPING_PRICE },
          },
        }),
      ).rejects.toThrow(`[${VALIDATION}]`);
    });
  });
});

function fixedRate(option: string): number {
  const method = dataset.shippingMethods.filter(({ code }) => code === FIXED_RATE)[0];
  return Number(method?.settings?.find(({ name }) => name?.endsWith(`.${option}.Rate`))?.value);
}
