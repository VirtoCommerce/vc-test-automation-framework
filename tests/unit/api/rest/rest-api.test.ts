import type { Server } from "node:http";
import type { APIRequestContext } from "@playwright/test";

import { createServer } from "node:http";

import { expect, test } from "@playwright/test";

import { HttpClient } from "@api/http/http-client";
import { AssetsClient } from "@api/rest/clients/assets-client";
import { CatalogClient } from "@api/rest/clients/catalog-client";
import { CompletenessClient } from "@api/rest/clients/completeness-client";
import { CurrenciesClient } from "@api/rest/clients/currencies-client";
import { CustomersClient } from "@api/rest/clients/customers-client";
import { DynamicContentClient } from "@api/rest/clients/dynamic-content-client";
import { DynamicPropertiesClient } from "@api/rest/clients/dynamic-properties-client";
import { HealthClient } from "@api/rest/clients/health-client";
import { JobsClient } from "@api/rest/clients/jobs-client";
import { MenuLinkListsClient } from "@api/rest/clients/menu-link-lists-client";
import { ModulesClient } from "@api/rest/clients/modules-client";
import { NotificationsClient } from "@api/rest/clients/notifications-client";
import { OAuthAppsClient } from "@api/rest/clients/oauth-apps-client";
import { OrdersClient } from "@api/rest/clients/orders-client";
import { OrganizationMembershipsClient } from "@api/rest/clients/organization-memberships-client";
import { PackageTypesClient } from "@api/rest/clients/package-types-client";
import { PageBuilderClient } from "@api/rest/clients/page-builder-client";
import { PersonalizationClient } from "@api/rest/clients/personalization-client";
import { PickupLocationsClient } from "@api/rest/clients/pickup-locations-client";
import { PlatformClient } from "@api/rest/clients/platform-client";
import { PricingClient } from "@api/rest/clients/pricing-client";
import { PromotionsClient } from "@api/rest/clients/promotions-client";
import { QuotesClient } from "@api/rest/clients/quotes-client";
import { RolesClient } from "@api/rest/clients/roles-client";
import { SearchIndexesClient } from "@api/rest/clients/search-indexes-client";
import { SeoInfosClient } from "@api/rest/clients/seo-infos-client";
import { SettingsClient } from "@api/rest/clients/settings-client";
import { ShippingMethodsClient } from "@api/rest/clients/shipping-methods-client";
import { StoresClient } from "@api/rest/clients/stores-client";
import { UsersClient } from "@api/rest/clients/users-client";
import { WhiteLabelingClient } from "@api/rest/clients/white-labeling-client";
import { RestApi } from "@api/rest/rest-api";

interface Received {
  readonly path: string;
  readonly user: string | undefined;
}

let server: Server;
let context: APIRequestContext;
const received: Received[] = [];

test.beforeAll(async ({ playwright }) => {
  server = createServer((request, response) => {
    received.push({ path: request.url ?? "", user: request.headers["x-test-user"] as string | undefined });
    response.writeHead(200, { "Content-Type": "application/json" }).end("[]");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("the stub server has no port");
  }
  context = await playwright.request.newContext({ baseURL: `http://127.0.0.1:${address.port}` });
});

test.afterAll(async () => {
  await context.dispose();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test.describe("RestApi", () => {
  test("holds every client", () => {
    const restApi = new RestApi(new HttpClient(context), "store-acme");

    expect(restApi.assets).toBeInstanceOf(AssetsClient);
    expect(restApi.catalog).toBeInstanceOf(CatalogClient);
    expect(restApi.completeness).toBeInstanceOf(CompletenessClient);
    expect(restApi.currencies).toBeInstanceOf(CurrenciesClient);
    expect(restApi.customers).toBeInstanceOf(CustomersClient);
    expect(restApi.dynamicContent).toBeInstanceOf(DynamicContentClient);
    expect(restApi.dynamicProperties).toBeInstanceOf(DynamicPropertiesClient);
    expect(restApi.health).toBeInstanceOf(HealthClient);
    expect(restApi.jobs).toBeInstanceOf(JobsClient);
    expect(restApi.menuLinkLists).toBeInstanceOf(MenuLinkListsClient);
    expect(restApi.modules).toBeInstanceOf(ModulesClient);
    expect(restApi.notifications).toBeInstanceOf(NotificationsClient);
    expect(restApi.oauthApps).toBeInstanceOf(OAuthAppsClient);
    expect(restApi.orders).toBeInstanceOf(OrdersClient);
    expect(restApi.organizationMemberships).toBeInstanceOf(OrganizationMembershipsClient);
    expect(restApi.packageTypes).toBeInstanceOf(PackageTypesClient);
    expect(restApi.pageBuilder).toBeInstanceOf(PageBuilderClient);
    expect(restApi.personalization).toBeInstanceOf(PersonalizationClient);
    expect(restApi.pickupLocations).toBeInstanceOf(PickupLocationsClient);
    expect(restApi.platform).toBeInstanceOf(PlatformClient);
    expect(restApi.pricing).toBeInstanceOf(PricingClient);
    expect(restApi.promotions).toBeInstanceOf(PromotionsClient);
    expect(restApi.quotes).toBeInstanceOf(QuotesClient);
    expect(restApi.roles).toBeInstanceOf(RolesClient);
    expect(restApi.searchIndexes).toBeInstanceOf(SearchIndexesClient);
    expect(restApi.seoInfos).toBeInstanceOf(SeoInfosClient);
    expect(restApi.settings).toBeInstanceOf(SettingsClient);
    expect(restApi.shippingMethods).toBeInstanceOf(ShippingMethodsClient);
    expect(restApi.stores).toBeInstanceOf(StoresClient);
    expect(restApi.users).toBeInstanceOf(UsersClient);
    expect(restApi.whiteLabeling).toBeInstanceOf(WhiteLabelingClient);
  });

  test("sends the requests of its clients through the given HttpClient", async () => {
    received.length = 0;
    const restApi = new RestApi(new HttpClient(context).withHeaders({ "X-Test-User": "rest-api-user" }), "store-acme");

    await restApi.modules.getInstalledIds();

    expect(received).toEqual([{ path: "/api/platform/modules", user: "rest-api-user" }]);
  });

  test("sends the requests of the clients' resources through the given HttpClient", async () => {
    received.length = 0;
    const restApi = new RestApi(new HttpClient(context).withHeaders({ "X-Test-User": "rest-api-user" }), "store-acme");

    await restApi.catalog.products.find("laptop");
    await restApi.customers.employees.getMany(["employee"]);

    expect(received).toEqual([
      { path: "/api/catalog/products?ids=laptop", user: "rest-api-user" },
      { path: "/api/employees?ids=employee", user: "rest-api-user" },
    ]);
  });
});
