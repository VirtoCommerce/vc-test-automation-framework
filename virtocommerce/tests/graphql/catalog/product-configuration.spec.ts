import { optionOfEachSection, productConfiguration } from "@builders/product-configuration.ts";
import { expect, test } from "@fixtures";
import { CreateConfiguredLineItemDocument } from "@graphql/generated/graphql.ts";
import { requireDefined } from "@support/require-fields.ts";

const CONFIGURABLE_PRODUCT_ID = "product-laptop-acer-predator-helios-neo-16-ai";

test.describe("configurable product (anonymous)", () => {
  test("configure a product into a line item", async ({ shopper }) => {
    const configuration = await productConfiguration(shopper, CONFIGURABLE_PRODUCT_ID);
    await test.step("assert: every section offers options", () => {
      const sections = requireDefined(configuration.configurationSections, "Configuration section");
      expect(sections.length).toBeGreaterThan(0);
      for (const section of sections) {
        expect(section.options?.length, `options of section ${section.name}`).toBeGreaterThan(0);
      }
    });
    const { storeId, cultureName, currencyCode } = shopper.storeContext;

    const { createConfiguredLineItem } = await test.step("act: configure the first option of each section", () =>
      shopper.graphql.execute(CreateConfiguredLineItemDocument, {
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
