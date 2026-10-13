import type { CustomerOrder } from "@api/rest/types/orders";
import type { StoreUnderTest } from "@dataset/store-under-test";

import { expect, test } from "@playwright/test";

import { Secret } from "@core/secret";
import { newCompletenessChannel } from "@dataset/builders/completeness";
import { newCurrency, newPackageType } from "@dataset/builders/core";
import { newContact, newCustomerAddress } from "@dataset/builders/customer";
import { executableFile, markdownFile } from "@dataset/builders/files";
import { newCoupon, newDynamicContent } from "@dataset/builders/marketing";
import { newOrder, withQuantity } from "@dataset/builders/order";
import { newProductPrice } from "@dataset/builders/pricing";
import { newApiKey, newPlatformUser, newRole } from "@dataset/builders/security";

const STORE: StoreUnderTest = {
  id: "store-acme",
  name: "ACME",
  catalog: "catalog-acme",
  defaultLanguage: "en-US",
  defaultCurrency: "USD",
};

const ORDER: CustomerOrder = {
  id: "order-1",
  number: "TEST-1",
  status: "New",
  storeId: STORE.id,
  customerId: "user-1",
  items: [],
};

test.describe("core builders", () => {
  test("key a currency by its code and a package type by its id", () => {
    const currency = newCurrency();
    const packageType = newPackageType();

    expect(currency.entry).toEqual({ code: currency.key, name: `Test currency ${currency.key}` });
    expect(packageType.entry).toEqual({ id: packageType.key, name: packageType.key });
  });
});

test.describe("customer builders", () => {
  test("put a contact in an organization only when one is given", () => {
    expect(newContact()).not.toHaveProperty("organizations");
    expect(newContact("organization-1")).toMatchObject({
      organizations: ["organization-1"],
      defaultOrganizationId: "organization-1",
    });
  });

  test("build a REST address with the REST address type and a unique street", () => {
    const [first, second] = [newCustomerAddress(), newCustomerAddress()];

    expect(first.addressType).toBe("BillingAndShipping");
    expect(first.line1).not.toBe(second.line1);
  });
});

test.describe("completeness builders", () => {
  test("cover the store's catalog in its default language and currency", () => {
    expect(newCompletenessChannel(STORE, { name: "ACME Catalog" })).toMatchObject({
      catalogId: "catalog-acme",
      catalogName: "ACME Catalog",
      languages: ["en-US"],
      currencies: ["USD"],
    });
  });
});

test.describe("marketing builders", () => {
  test("build an inactive publication and active-less other dynamic content", () => {
    expect(newDynamicContent("publications")).toMatchObject({ isActive: false });
    expect(newDynamicContent("folders").name).toMatch(/^test-content-folders-/);
  });

  test("give a coupon an upper-case unique code and its limits", () => {
    expect(newCoupon("promotion-1", { maxUsesNumber: 15, maxUsesPerUser: 10 })).toMatchObject({
      promotionId: "promotion-1",
      code: expect.stringMatching(/^TEST-COUPON-[0-9A-F]{8}$/),
      maxUsesNumber: 15,
      maxUsesPerUser: 10,
    });
  });
});

test.describe("order builders", () => {
  test("number a new order after its id", () => {
    const order = newOrder({ id: STORE.id, currency: "USD" }, { id: "user-1", userName: "user@example.com" });

    expect(order.number).toBe(`TEST-${order.id.slice(0, 8).toUpperCase()}`);
    expect(order).toMatchObject({ storeId: STORE.id, customerId: "user-1", status: "New", items: [] });
  });

  test("change the quantity of an order's only line item", () => {
    const order: CustomerOrder = { ...ORDER, items: [{ id: "item-1", quantity: 1 }] };

    expect(withQuantity(order, 2).items).toEqual([{ id: "item-1", quantity: 2 }]);
  });

  test("refuse an order without exactly one line item", () => {
    const order: CustomerOrder = { ...ORDER, items: [] };

    expect(() => withQuantity(order, 2)).toThrow("Order TEST-1 has 0 line items, expected one");
  });
});

test.describe("pricing builders", () => {
  test("price a product from quantity 1 in the pricelist's currency", () => {
    expect(newProductPrice({ id: "pricelist-1", currency: "EUR" }, "product-1", 9.99)).toEqual({
      productId: "product-1",
      prices: [{ pricelistId: "pricelist-1", productId: "product-1", list: 9.99, minQuantity: 1, currency: "EUR" }],
    });
  });
});

test.describe("security builders", () => {
  test("build a manager without roles, with a secret password", () => {
    const user = newPlatformUser(STORE.id, { isAdministrator: true });

    expect(user).toMatchObject({ userType: "Manager", storeId: STORE.id, roles: [], isAdministrator: true });
    expect(user.email).toBe(user.userName);
    expect(user.password).toBeInstanceOf(Secret);
  });

  test("give a role its permissions by name", () => {
    expect(newRole(["security:call_api"]).permissions).toEqual([{ name: "security:call_api" }]);
  });

  test("build an API key of 32 hexadecimal characters, as a secret", () => {
    expect(newApiKey().reveal()).toMatch(/^[0-9a-f]{32}$/);
  });
});

test.describe("file builders", () => {
  test("name a markdown file uniquely after its prefix", () => {
    expect(markdownFile("test-page").name).toMatch(/^test-page-[0-9a-f]{8}\.md$/);
  });

  test("build an executable with the .exe extension", () => {
    expect(executableFile()).toMatchObject({
      name: expect.stringMatching(/\.exe$/),
      mimeType: "application/octet-stream",
    });
  });
});
