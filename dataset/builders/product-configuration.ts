import type { ConfigurationSectionInput, ProductConfigurationFragment } from "@api/graphql/generated/graphql";

import { requireDefined, requireFields } from "@core/required-fields";

/** Picks the last option of each section in {@link optionOfEachSection}. */
export const LAST_OPTION = Number.POSITIVE_INFINITY;

/** Returns the SKU the platform gives a configured product's line item: `Configuration-<productCode>`. */
export function configuredSku(productCode: string): string {
  return `Configuration-${productCode}`;
}

/**
 * Selects one option in every section of a product configuration, as the frontend sends it.
 *
 * @param configuration - From the `ProductConfiguration` query.
 * @param optionIndex - The first by default; {@link LAST_OPTION}, or any index past the end, takes the last.
 * @throws Error naming the section that has no option or whose option has no product.
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
