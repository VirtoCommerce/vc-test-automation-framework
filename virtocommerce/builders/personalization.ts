/** A product or category that personalization tags are set on. */
export interface TaggedEntity {
  readonly entityId: string;
  readonly entityType: "Product" | "Category";
  readonly label: string;
}

/**
 * Returns a product as an entity to tag.
 *
 * @param product - The product.
 * @returns The entity.
 */
export function taggedProduct(product: { readonly id: string; readonly name: string }): TaggedEntity {
  return { entityId: product.id, entityType: "Product", label: product.name };
}

/**
 * Returns a category as an entity to tag.
 *
 * @param category - The category.
 * @returns The entity.
 */
export function taggedCategory(category: { readonly id: string; readonly name: string }): TaggedEntity {
  return { entityId: category.id, entityType: "Category", label: category.name };
}
