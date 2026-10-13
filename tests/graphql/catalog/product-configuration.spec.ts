import * as allure from "allure-js-commons";

import { CreateConfiguredLineItemDocument } from "@api/graphql/generated/graphql";
import { requireDefined } from "@core/required-fields";
import { optionOfEachSection } from "@dataset/builders/product-configuration";
import { expect, test } from "@fixtures";

const CONFIGURABLE_PRODUCT_ID = "product-laptop-acer-predator-helios-neo-16-ai";

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Catalog / Configurable Product");
});

test.describe("configurable product (anonymous)", () => {
  test("configure a product into a line item", async ({ api, arrange }) => {
    await allure.story("Configuration");
    await allure.description(
      "Every section of a configurable product offers options; one option of each makes a configured item.",
    );
    const configuration = await arrange.catalog.productConfiguration(api, CONFIGURABLE_PRODUCT_ID);
    await test.step("assert: every section offers options", () => {
      const sections = requireDefined(configuration.configurationSections, "Configuration section");
      expect(sections.length).toBeGreaterThan(0);
      for (const section of sections) {
        expect(section.options?.length, `options of section ${section.name}`).toBeGreaterThan(0);
      }
    });
    const { storeId, cultureName, currencyCode } = await api.storeContext();

    const { createConfiguredLineItem } = await test.step("act: configure the first option of each section", () =>
      api.graphql.execute(CreateConfiguredLineItemDocument, {
        command: {
          configurableProductId: CONFIGURABLE_PRODUCT_ID,
          configurationSections: optionOfEachSection(configuration),
          storeId,
          cultureName,
          currencyCode,
        },
      }));

    await test.step("assert: one configured item of the product is created", () => {
      expect(createConfiguredLineItem).toMatchObject({ quantity: 1, product: { id: CONFIGURABLE_PRODUCT_ID } });
    });
  });
});
