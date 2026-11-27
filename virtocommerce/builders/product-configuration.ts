import type { Shopper } from "../arrange/shopper.ts";
import type { ConfigurationSectionInput, ProductConfigurationFragment } from "../graphql/generated/graphql.ts";

import { ProductConfigurationDocument } from "../graphql/generated/graphql.ts";
import { requireDefined, requireFields } from "../support/require-fields.ts";

/** The index that selects the last option of each section in {@link optionOfEachSection}. */
export const LAST_OPTION = Number.POSITIVE_INFINITY;

/**
 * Returns the SKU of the line item of a configured product.
 *
 * @param productCode - The SKU of the configurable product.
 * @returns The SKU of its configured line item.
 */
export function configuredSku(productCode: string): string {
  return `Configuration-${productCode}`;
}

/**
 * Returns the sections of a configurable product as the shopper sees them, with their prices and availability.
 *
 * @param shopper - The shopper whose prices apply.
 * @param productId - The identifier of the configurable product.
 * @returns The configuration.
 * @throws {Error} The product has no configuration sections.
 */
export async function productConfiguration(shopper: Shopper, productId: string): Promise<ProductConfigurationFragment> {
  const { productConfiguration: configuration } = await shopper.graphql.execute(ProductConfigurationDocument, {
    ...shopper.storeContext,
    configurableProductId: productId,
  });
  return requireFields(configuration, ["configurationSections"], `Configuration of "${productId}"`);
}

/**
 * Returns a selection of one option in each section of a configuration, for the `configurationSections` of a cart
 * item.
 *
 * @param configuration - The configuration of the product.
 * @param optionIndex - The option to select in each section: the first by default, or {@link LAST_OPTION}.
 * @returns The selection.
 * @throws {Error} A section has no options.
 */
export function optionOfEachSection(
  configuration: ProductConfigurationFragment,
  optionIndex = 0,
): ConfigurationSectionInput[] {
  return requireDefined(configuration.configurationSections, "Configuration section").map((section) => {
    const options = requireDefined(section.options, `Option of configuration section "${section.id}"`);
    const option = requireFields(
      options[Math.min(optionIndex, options.length - 1)],
      ["product"],
      `Option of configuration section "${section.id}"`,
    );
    return {
      sectionId: section.id,
      type: section.type,
      option: { productId: option.product.id, quantity: option.quantity },
    };
  });
}
