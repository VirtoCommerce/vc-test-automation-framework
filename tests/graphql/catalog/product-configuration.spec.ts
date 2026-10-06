import * as allure from "allure-js-commons";

import { CreateConfiguredLineItemDocument } from "@api/graphql/generated/graphql";
import { getProductConfiguration } from "@dataset/arrange/catalog";
import { optionOfEachSection } from "@dataset/builders/product-configuration";
import { SEEDED_PRODUCTS } from "@dataset/seeded";
import { expect, test } from "@fixtures";

const CONFIGURABLE_PRODUCT_ID = SEEDED_PRODUCTS.configurableLaptop;

test.beforeEach(async () => {
  await allure.feature("Catalog / Configurable Product");
});

test.describe("configurable product (anonymous)", () => {
  test("configure a product into a line item", async ({ graphqlClient, frontendContext }) => {
    const configuration = await test.step("arrange: product configuration", () =>
      getProductConfiguration(graphqlClient, frontendContext, CONFIGURABLE_PRODUCT_ID));
    await test.step("assert: every section offers options", async () => {
      expect(configuration.configurationSections.length).toBeGreaterThan(0);
      for (const section of configuration.configurationSections) {
        expect(section?.options?.length).toBeGreaterThan(0);
      }
    });

    const { createConfiguredLineItem } = await test.step("act: configure the first option of each section", () =>
      graphqlClient.execute(CreateConfiguredLineItemDocument, {
        command: {
          configurableProductId: CONFIGURABLE_PRODUCT_ID,
          configurationSections: optionOfEachSection(configuration),
          storeId: frontendContext.storeId,
          cultureName: frontendContext.cultureName,
          currencyCode: frontendContext.currencyCode,
        },
      }));

    await test.step("assert: one configured item of the product is created", async () => {
      expect(createConfiguredLineItem).toMatchObject({ quantity: 1, product: { id: CONFIGURABLE_PRODUCT_ID } });
    });
  });
});
