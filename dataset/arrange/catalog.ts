import type {
  ProductConfigurationFragment,
  ProductFragment,
  ProductsQueryVariables,
} from "@api/graphql/generated/graphql";
import type { GraphqlClient } from "@api/graphql/graphql-client";
import type { CatalogClient } from "@api/rest/clients/catalog-client";
import type { CatalogProduct, Category } from "@api/rest/types/catalog";
import type { WithRequired } from "@core/required-fields";
import type { FrontendContext } from "../frontend-context";

import { ProductConfigurationDocument, ProductsDocument } from "@api/graphql/generated/graphql";
import { requireFields } from "@core/required-fields";

import { newCategory, newProduct } from "../builders/catalog";
import { cartScope } from "./cart";

const SEARCH_PAGE_SIZE = 100;

export type ProductSearch = Pick<ProductsQueryVariables, "query" | "filter" | "sort">;

export async function searchProducts(
  graphqlClient: GraphqlClient,
  context: FrontendContext,
  search: ProductSearch,
): Promise<ProductFragment[]> {
  const { products } = await graphqlClient.execute(ProductsDocument, {
    ...cartScope(context),
    first: SEARCH_PAGE_SIZE,
    ...search,
  });
  const items = (products?.items ?? []).flatMap((item) => (item === null ? [] : [item]));
  if (items.length === SEARCH_PAGE_SIZE) {
    throw new Error(`Product search ${JSON.stringify(search)} filled a whole page of ${SEARCH_PAGE_SIZE}; narrow it`);
  }
  return items;
}

export async function getProductConfiguration(
  graphqlClient: GraphqlClient,
  context: FrontendContext,
  productId: string,
): Promise<WithRequired<ProductConfigurationFragment, "configurationSections">> {
  const { productConfiguration } = await graphqlClient.execute(ProductConfigurationDocument, {
    configurableProductId: productId,
    ...cartScope(context),
  });
  return requireFields(productConfiguration, ["configurationSections"], `Configuration of "${productId}"`);
}

export async function createCategoryWithProduct(
  catalogClient: CatalogClient,
  catalogId: string,
): Promise<{ readonly category: Category; readonly product: CatalogProduct }> {
  const category = await catalogClient.saveCategory(newCategory(catalogId));
  const product = await catalogClient.saveProduct(newProduct(catalogId, category.id));
  return { category, product };
}
