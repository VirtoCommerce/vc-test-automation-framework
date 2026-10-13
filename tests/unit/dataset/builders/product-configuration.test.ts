import type { ProductConfigurationFragment } from "@api/graphql/generated/graphql";

import { expect, test } from "@playwright/test";

import { configuredSku, LAST_OPTION, optionOfEachSection } from "@dataset/builders/product-configuration";

type Section = NonNullable<NonNullable<ProductConfigurationFragment["configurationSections"]>[number]>;
type Option = NonNullable<NonNullable<Section["options"]>[number]>;

const MONEY = { amount: 10, formattedAmount: "$10.00" };
const OPTION_PRICES = { listPrice: MONEY, salePrice: MONEY, extendedPrice: MONEY, discountAmount: null };
const PRODUCT = {
  code: "CODE",
  productType: "Physical",
  isConfigurable: false,
  name: "Product",
  vendor: null,
  price: { list: MONEY, actual: MONEY },
};
const SECTION = {
  name: null,
  description: null,
  isRequired: true,
  type: "Product",
  allowCustomText: false,
  allowTextOptions: false,
  maxLength: null,
};
const MEMORY_8: Option = {
  id: "option-8",
  text: null,
  quantity: 1,
  product: { ...PRODUCT, id: "memory-8" },
  ...OPTION_PRICES,
};
const MEMORY_16: Option = {
  id: "option-16",
  text: null,
  quantity: 2,
  product: { ...PRODUCT, id: "memory-16" },
  ...OPTION_PRICES,
};
const DISK: Option = {
  id: "option-ssd",
  text: null,
  quantity: 1,
  product: { ...PRODUCT, id: "disk-ssd" },
  ...OPTION_PRICES,
};
const CONFIGURATION: ProductConfigurationFragment = {
  configurationSections: [
    { ...SECTION, id: "section-memory", options: [MEMORY_8, MEMORY_16] },
    { ...SECTION, id: "section-disk", options: [DISK] },
  ],
};

test.describe("configuredSku", () => {
  test("prefixes the product code", () => {
    expect(configuredSku("LAPTOP-1")).toBe("Configuration-LAPTOP-1");
  });
});

test.describe("optionOfEachSection", () => {
  test("selects the first option of every section by default", () => {
    expect(optionOfEachSection(CONFIGURATION)).toEqual([
      { sectionId: "section-memory", type: "Product", option: { productId: "memory-8", quantity: 1 } },
      { sectionId: "section-disk", type: "Product", option: { productId: "disk-ssd", quantity: 1 } },
    ]);
  });

  test("selects the last option, or the last one past the end", () => {
    expect(optionOfEachSection(CONFIGURATION, LAST_OPTION).map(({ option }) => option?.productId)).toEqual([
      "memory-16",
      "disk-ssd",
    ]);
  });

  test("names the section whose option has no product", () => {
    const configuration: ProductConfigurationFragment = {
      configurationSections: [{ ...SECTION, id: "section-empty", options: [{ ...MEMORY_8, product: null }] }],
    };

    expect(() => optionOfEachSection(configuration)).toThrow(/section "section-empty"/);
  });
});
