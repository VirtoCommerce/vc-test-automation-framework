import type { CompletenessChannelDraft } from "../builders/completeness.ts";
import type { TaggedEntity } from "../builders/personalization.ts";
import type {
  VirtoCommerceCatalogModuleCoreModelCatalog as Catalog,
  VirtoCommerceCatalogModuleCoreModelCatalogProduct as CatalogProduct,
  VirtoCommerceCatalogModuleCoreModelCategory as Category,
} from "../rest/generated/platform.ts";
import type { WithRequired } from "../support/require-fields.ts";
import type { ArrangeContext } from "./context.ts";

import { newCatalog, newCategory, newProduct } from "../builders/catalog.ts";
import { newCompletenessChannel } from "../builders/completeness.ts";
import { dataset } from "../dataset/index.ts";
import { setTags } from "../support/personalization.ts";
import { requireFields } from "../support/require-fields.ts";

/** A catalog as the platform saved it. */
export type ArrangedCatalog = WithRequired<Catalog, "id" | "name">;

/** A category as the platform saved it. */
export type ArrangedCategory = WithRequired<Category, "id" | "name" | "code" | "catalogId">;

/** A product as the platform saved it. */
export type ArrangedProduct = WithRequired<CatalogProduct, "id" | "code" | "name" | "catalogId" | "categoryId">;

/** Arranges catalogs, categories, products, personalization tags and completeness channels. */
export interface CatalogArrange {
  /**
   * Creates an empty physical catalog in the default language of the store and deletes it, with its categories and
   * products, after the test.
   *
   * @param overrides - Fields of the catalog, such as `isVirtual`.
   */
  catalog(overrides?: Partial<Omit<Catalog, "id">>): Promise<ArrangedCatalog>;
  /**
   * Creates a category in a catalog from {@link CatalogArrange#catalog}; it is deleted with that catalog.
   *
   * @param parentId - The parent category; a top-level category by default.
   */
  category(catalogId: string, parentId?: string): Promise<ArrangedCategory>;
  /**
   * Creates a physical product in a category of a catalog from {@link CatalogArrange#catalog}; it is deleted with
   * that catalog.
   *
   * @param overrides - Fields of the product, such as `trackInventory`.
   */
  product(category: ArrangedCategory, overrides?: Partial<CatalogProduct>): Promise<ArrangedProduct>;
  /**
   * Creates a physical product in a new catalog and category, all deleted after the test. The catalog is not the
   * store's catalog, so the frontend does not list the product.
   *
   * @param overrides - Fields of the product, such as `trackInventory`.
   */
  catalogProduct(overrides?: Partial<CatalogProduct>): Promise<ArrangedProduct>;
  /** Sets the personalization tags of a product or category, and clears them after the test. */
  tags(entity: TaggedEntity, tags: readonly string[]): Promise<void>;
  /** Creates a completeness channel for the store's catalog, language and currency, and deletes it after the test. */
  completenessChannel(): Promise<CompletenessChannelDraft>;
  /** Deletes a catalog after the test, such as one that the code under test creates. */
  deleteCatalogLater(catalogId: string): void;
  /** Clears the personalization tags of a product or category after the test, such as tags the test sets. */
  clearTagsLater(entity: TaggedEntity): void;
  /** Deletes a completeness channel after the test, such as one that the code under test creates. */
  deleteCompletenessChannelLater(channelId: string): void;
}

const CATALOG_PATH = "/api/catalog";
const CHANNELS_PATH = "/api/completeness/channels";

/**
 * Returns the catalog methods of `arrange`.
 *
 * @param context - What the methods create and remove data with.
 * @returns The methods.
 */
export function catalogArrange({ admin, store, later }: ArrangeContext): CatalogArrange {
  async function catalog(overrides: Partial<Omit<Catalog, "id">> = {}): Promise<ArrangedCatalog> {
    const client = await admin();
    const draft = { ...newCatalog(store.defaultLanguage), ...overrides };
    const created = (await client.post(`${CATALOG_PATH}/catalogs`, { json: draft })).expectOk().json<Catalog>();
    deleteCatalogLater(draft.id);
    return requireFields(created, ["id", "name"], `Catalog ${draft.name}`);
  }

  async function category(catalogId: string, parentId?: string): Promise<ArrangedCategory> {
    const draft = parentId === undefined ? newCategory(catalogId) : { ...newCategory(catalogId), parentId };
    const created = (await (await admin()).post(`${CATALOG_PATH}/categories`, { json: draft }))
      .expectOk()
      .json<Category>();
    return requireFields(created, ["id", "name", "code", "catalogId"], `A category of ${catalogId}`);
  }

  async function product(parent: ArrangedCategory, overrides: Partial<CatalogProduct> = {}): Promise<ArrangedProduct> {
    const draft = newProduct(parent.catalogId, parent.id, overrides);
    const created = (await (await admin()).post(`${CATALOG_PATH}/products`, { json: draft }))
      .expectOk()
      .json<CatalogProduct>();
    return requireFields(created, ["id", "code", "name", "catalogId", "categoryId"], `A product of ${parent.id}`);
  }

  async function catalogProduct(overrides: Partial<CatalogProduct> = {}): Promise<ArrangedProduct> {
    const { id } = await catalog();
    return product(await category(id), overrides);
  }

  async function tags(entity: TaggedEntity, values: readonly string[]): Promise<void> {
    clearTagsLater(entity);
    await setTags(await admin(), entity, values);
  }

  async function completenessChannel(): Promise<CompletenessChannelDraft> {
    const catalogName = dataset.catalogs.get(store.catalog).name ?? null;
    const draft = newCompletenessChannel(store, catalogName);
    (await (await admin()).post(CHANNELS_PATH, { json: draft })).expectOk();
    deleteCompletenessChannelLater(draft.id);
    return draft;
  }

  function deleteCatalogLater(catalogId: string): void {
    later(`delete catalog ${catalogId}`, async () =>
      (await (await admin()).delete(`${CATALOG_PATH}/catalogs/${encodeURIComponent(catalogId)}`)).expectOk(),
    );
  }

  function clearTagsLater(entity: TaggedEntity): void {
    later(`clear the tags of ${entity.label}`, async () => setTags(await admin(), entity, []));
  }

  function deleteCompletenessChannelLater(channelId: string): void {
    later(`delete completeness channel ${channelId}`, async () =>
      (await (await admin()).delete(CHANNELS_PATH, { query: { ids: [channelId] } })).expectOk(),
    );
  }

  return {
    catalog,
    category,
    product,
    catalogProduct,
    tags,
    completenessChannel,
    deleteCatalogLater,
    clearTagsLater,
    deleteCompletenessChannelLater,
  };
}
