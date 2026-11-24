import { expect as base } from "@playwright/test";

interface Money {
  readonly amount: number;
}

interface CartTotals {
  readonly total: Money;
  readonly subTotal: Money;
  readonly discountTotal: Money;
  readonly taxTotal: Money;
  readonly shippingTotal: Money;
}

const CENT = 0.005;
const TOTALS = ["total", "subTotal", "discountTotal", "taxTotal", "shippingTotal"] as const;

declare global {
  namespace PlaywrightTest {
    interface Matchers<R> {
      /** Checks that the total of a cart is its subtotal, less the discounts, plus the tax and the shipping. */
      toHaveConsistentTotals(): R;
    }
  }
}

/** The Playwright `expect` with the matchers of the test suite. */
export const expect = base.extend({
  toHaveConsistentTotals(received: unknown) {
    if (!hasTotals(received)) {
      return {
        name: "toHaveConsistentTotals",
        pass: false,
        message: () =>
          `Expected a cart with the amounts of ${TOTALS.join(", ")}\nReceived: ${JSON.stringify(received)}`,
      };
    }
    const { total, subTotal, discountTotal, taxTotal, shippingTotal } = received;
    const expected = subTotal.amount - discountTotal.amount + taxTotal.amount + shippingTotal.amount;
    const pass = Math.abs(total.amount - expected) < CENT;
    return {
      name: "toHaveConsistentTotals",
      pass,
      expected,
      actual: total.amount,
      message: () =>
        `Expected the total ${total.amount} ${pass ? "not " : ""}to be subTotal ${subTotal.amount} - discountTotal ` +
        `${discountTotal.amount} + taxTotal ${taxTotal.amount} + shippingTotal ${shippingTotal.amount} = ${expected}`,
    };
  },
});

function hasTotals(value: unknown): value is CartTotals {
  return (
    typeof value === "object" &&
    value !== null &&
    TOTALS.every(
      (name) => typeof (value as Record<string, { amount?: unknown } | undefined>)[name]?.amount === "number",
    )
  );
}
