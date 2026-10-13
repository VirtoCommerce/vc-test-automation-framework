import type { TaggedEntity } from "@api/rest/types/personalization";

/** Describes a product as a tagged entity, labeled with its name. */
export function taggedProduct(product: { readonly id: string; readonly name: string }): TaggedEntity {
  return { entityId: product.id, entityType: "Product", label: product.name };
}

/** Describes a category as a tagged entity, labeled with its name. */
export function taggedCategory(category: { readonly id: string; readonly name: string }): TaggedEntity {
  return { entityId: category.id, entityType: "Category", label: category.name };
}
