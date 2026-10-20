import type { GraphqlErrorEntry } from "./graphql/graphql-error";

import { expect as baseExpect } from "@playwright/test";
import { number, object } from "zod";

import { Secret } from "@core/secret";

import { GraphqlError } from "./graphql/graphql-error";
import { HttpError } from "./http/http-error";

const Money = object({ amount: number() });
const CartTotalsSchema = object({
  total: Money,
  subTotal: Money,
  discountTotal: Money,
  taxTotal: Money,
  shippingTotal: Money,
});
const CENT = 0.005;

declare global {
  namespace PlaywrightTest {
    interface Matchers<R, T> {
      toBeHttpError(status: number, detail?: string): R;
      toBeGraphqlError(code?: string): R;
      toHaveConsistentTotals(): R;
    }
  }
}

/**
 * `expect` with matchers for errors the API clients throw, used with `.rejects`; failure messages mask secrets.
 * Tests get these through the `expect` exported by `@fixtures`, not from here.
 *
 * @example
 * await expect(api.rest.stores.get(storeId)).rejects.toBeHttpError(401);
 * await expect(api.rest.assets.folders.create("")).rejects.toBeHttpError(400, "Folder name must not be empty");
 * await expect(api.graphql.execute(AddItemDocument, variables)).rejects.toBeGraphqlError("VALIDATION_ERROR");
 */
export const apiExpect = baseExpect.extend({
  /**
   * Passes for an `HttpError` with this status and, if given, `detail` in its response body (not the URL).
   *
   * @param detail - Substring of the platform's rejection reason, such as `"Folder name must not be empty"`.
   */
  toBeHttpError(received: unknown, status: number, detail?: string) {
    const pass = HttpError.hasStatus(received, status) && (detail === undefined || received.body.includes(detail));
    return {
      name: "toBeHttpError",
      pass,
      expected: detail === undefined ? status : `${status} with "${detail}"`,
      actual: received instanceof HttpError ? received.status : undefined,
      message: () =>
        failure(pass, `HttpError with status ${status}${detail === undefined ? "" : ` and "${detail}"`}`, received),
    };
  },

  /**
   * Passes for a `GraphqlError` with an entry whose `extensions.code` is `code`; any `GraphqlError` when omitted.
   *
   * @param code - Such as `"VALIDATION_ERROR"`.
   */
  toBeGraphqlError(received: unknown, code?: string) {
    const codes = received instanceof GraphqlError ? received.errors.flatMap(codesOf) : [];
    const pass = received instanceof GraphqlError && (code === undefined || codes.includes(code));
    return {
      name: "toBeGraphqlError",
      pass,
      expected: code,
      actual: codes,
      message: () => failure(pass, code === undefined ? "GraphqlError" : `GraphqlError with code ${code}`, received),
    };
  },

  /**
   * Passes for a cart whose total is its subtotal minus its discounts plus tax and shipping, to the cent. Works on
   * any cart with those five money fields, such as the result of `addCoupon`.
   *
   * @example
   * expect(addCoupon).toHaveConsistentTotals();
   */
  toHaveConsistentTotals(received: unknown) {
    const parsed = CartTotalsSchema.safeParse(received);
    if (!parsed.success) {
      return {
        name: "toHaveConsistentTotals",
        pass: false,
        message: () =>
          "Expected a cart with total, subTotal, discountTotal, taxTotal and shippingTotal amounts\n" +
          `Received: ${describeReceived(JSON.stringify(received))}`,
      };
    }
    const { total, subTotal, discountTotal, taxTotal, shippingTotal } = parsed.data;
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

function failure(pass: boolean, expected: string, received: unknown): string {
  return `Expected ${pass ? "not " : ""}${expected}\nReceived: ${describeReceived(received)}`;
}

function describeReceived(received: unknown): string {
  return Secret.mask(received instanceof Error ? `${received.name}: ${received.message}` : String(received));
}

function codesOf(entry: GraphqlErrorEntry): string[] {
  const code = entry.extensions?.["code"];
  return typeof code === "string" ? [code] : [];
}
