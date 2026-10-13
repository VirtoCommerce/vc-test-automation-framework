import type { ApiSession } from "@api/api-session";
import type { ProductConfigurationFragment } from "@api/graphql/generated/graphql";
import type { Catalog, CatalogData, CatalogProduct, CatalogProductData, Category } from "@api/rest/types/catalog";
import type { CompletenessChannel } from "@api/rest/types/completeness";
import type { TaggedEntity } from "@api/rest/types/personalization";
import type { CleanupStack } from "@core/cleanup-stack";
import type { Dataset } from "../dataset";
import type { StoreUnderTest } from "../store-under-test";
import type { ArrangeContext } from "./context";

import { ProductConfigurationDocument } from "@api/graphql/generated/graphql";
import { requireFields } from "@core/required-fields";

import { newCatalog, newCategory, newProduct } from "../builders/catalog";
import { newCompletenessChannel } from "../builders/completeness";

/** Arranges catalogs, categories, products, personalization tags, product configurations and completeness channels. */
export class CatalogArrange {
  readonly #admin: ApiSession;
  readonly #cleanup: CleanupStack;
  readonly #dataset: Dataset;
  readonly #store: StoreUnderTest;

  constructor({ admin, cleanup, dataset, store }: ArrangeContext) {
    this.#admin = admin;
    this.#cleanup = cleanup;
    this.#dataset = dataset;
    this.#store = store;
  }

  /**
   * Creates an empty physical catalog in the store's default language and deletes it, with its categories and
   * products, after the test.
   *
   * @param overrides - Such as `isVirtual`.
   */
  async catalog(overrides: Partial<Omit<CatalogData, "id">> = {}): Promise<Catalog> {
    const { catalogs } = this.#admin.rest.catalog;
    const draft = { ...newCatalog(this.#store.defaultLanguage), ...overrides };
    this.#cleanup.push(`delete catalog ${draft.name}`, () => catalogs.delete(draft.id));
    return catalogs.create(draft);
  }

  /**
   * Creates a category in a catalog from {@link CatalogArrange#catalog}; registers no cleanup of its own, so it is
   * removed only with that catalog.
   *
   * @param parentId - Parent category; omit for a top-level category.
   */
  async category(catalogId: string, parentId?: string): Promise<Category> {
    const draft = newCategory(catalogId);
    return this.#admin.rest.catalog.categories.save(parentId === undefined ? draft : { ...draft, parentId });
  }

  /**
   * Creates a physical product in a category of a catalog from {@link CatalogArrange#catalog}; it is removed only with
   * that catalog. Use {@link CatalogArrange#catalogProduct} when the test needs just one product.
   *
   * @param overrides - Such as `trackInventory`.
   */
  async product(
    category: { readonly id: string; readonly catalogId: string },
    overrides: Partial<CatalogProductData> = {},
  ): Promise<CatalogProduct> {
    return this.#admin.rest.catalog.products.save(newProduct(category.catalogId, category.id, overrides));
  }

  /**
   * Creates a physical product in a new catalog and category, all deleted after the test.
   * The catalog is not the store's catalog, so the product is not on the frontend.
   *
   * @param overrides - Such as `trackInventory`.
   */
  async catalogProduct(overrides: Partial<CatalogProductData> = {}): Promise<CatalogProduct> {
    const catalog = await this.catalog();
    return this.product(await this.category(catalog.id), overrides);
  }

  /** Sets personalization tags on a product or category and clears all its tags after the test. */
  async tags(entity: TaggedEntity, tags: readonly string[]): Promise<void> {
    const { taggedItems } = this.#admin.rest.personalization;
    this.#cleanup.push(`clear the tags of ${entity.label}`, () => taggedItems.setTags(entity, []));
    await taggedItems.setTags(entity, tags);
  }

  /**
   * Reads a configurable product's sections as the shopper sees them (their prices and availability); creates
   * nothing. Use it to pick options for a configurable item in {@link CartArrange#cart}.
   */
  async productConfiguration(shopper: ApiSession, productId: string): Promise<ProductConfigurationFragment> {
    const { productConfiguration } = await shopper.graphql.execute(ProductConfigurationDocument, {
      ...(await shopper.storeContext()),
      configurableProductId: productId,
    });
    return requireFields(productConfiguration, ["configurationSections"], `Configuration of "${productId}"`);
  }

  /** Creates a completeness channel for the store's catalog, language and currency and deletes it after the test. */
  async completenessChannel(): Promise<CompletenessChannel> {
    const { channels } = this.#admin.rest.completeness;
    const draft = newCompletenessChannel(this.#store, this.#dataset.catalogs.get(this.#store.catalog));
    this.#cleanup.push(`delete completeness channel ${draft.name}`, () => channels.delete([draft.id]));
    return channels.create(draft);
  }
}
