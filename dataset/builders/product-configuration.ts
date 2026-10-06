import type { ConfigurationSectionInput, ProductConfigurationFragment } from "@api/graphql/generated/graphql";

import { requireFields } from "@core/required-fields";

export const LAST_OPTION = Number.POSITIVE_INFINITY;

export function configuredSku(productId: string): string {
  return `Configuration-${productId}`;
}

export function optionOfEachSection(
  configuration: ProductConfigurationFragment,
  optionIndex = 0,
): ConfigurationSectionInput[] {
  return (configuration.configurationSections ?? []).map((entry, sectionIndex) => {
    const section = requireFields(entry, ["type"], `Configuration section #${sectionIndex + 1}`);
    const options = section.options ?? [];
    const option = requireFields(
      options[Math.min(optionIndex, options.length - 1)],
      ["product"],
      `Option of configuration section "${section.id}"`,
    );
    const { id: productId } = requireFields(option.product, ["id"], `Product of section "${section.id}"`);
    return { sectionId: section.id, type: section.type, option: { productId, quantity: option.quantity } };
  });
}
