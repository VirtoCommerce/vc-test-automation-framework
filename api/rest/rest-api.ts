import type { HttpClient } from "../http/http-client";

import { AssetsClient } from "./clients/assets-client";
import { CatalogClient } from "./clients/catalog-client";
import { CompletenessClient } from "./clients/completeness-client";
import { ContentClient } from "./clients/content-client";
import { CurrenciesClient } from "./clients/currencies-client";
import { CustomersClient } from "./clients/customers-client";
import { DynamicContentClient } from "./clients/dynamic-content-client";
import { DynamicPropertiesClient } from "./clients/dynamic-properties-client";
import { HealthClient } from "./clients/health-client";
import { JobsClient } from "./clients/jobs-client";
import { MenuLinkListsClient } from "./clients/menu-link-lists-client";
import { ModulesClient } from "./clients/modules-client";
import { NotificationsClient } from "./clients/notifications-client";
import { OAuthAppsClient } from "./clients/oauth-apps-client";
import { OrdersClient } from "./clients/orders-client";
import { OrganizationMembershipsClient } from "./clients/organization-memberships-client";
import { PackageTypesClient } from "./clients/package-types-client";
import { PageBuilderClient } from "./clients/page-builder-client";
import { PersonalizationClient } from "./clients/personalization-client";
import { PickupLocationsClient } from "./clients/pickup-locations-client";
import { PlatformClient } from "./clients/platform-client";
import { PricingClient } from "./clients/pricing-client";
import { PromotionsClient } from "./clients/promotions-client";
import { QuotesClient } from "./clients/quotes-client";
import { RolesClient } from "./clients/roles-client";
import { SearchIndexesClient } from "./clients/search-indexes-client";
import { SeoInfosClient } from "./clients/seo-infos-client";
import { SettingsClient } from "./clients/settings-client";
import { StoresClient } from "./clients/stores-client";
import { UsersClient } from "./clients/users-client";
import { WhiteLabelingClient } from "./clients/white-labeling-client";

/**
 * All platform REST clients over one `HttpClient`, so every call goes out as the same user.
 * Store-bound clients (content, menu link lists) use the store given here. Get it as `ApiSession#rest`.
 *
 * @example
 * const product = await restApi.catalog.products.get(id);
 * const coupon = await restApi.promotions.coupons.find(couponId);
 */
export class RestApi {
  readonly assets: AssetsClient;
  readonly catalog: CatalogClient;
  readonly completeness: CompletenessClient;
  readonly content: ContentClient;
  readonly currencies: CurrenciesClient;
  readonly customers: CustomersClient;
  readonly dynamicContent: DynamicContentClient;
  readonly dynamicProperties: DynamicPropertiesClient;
  readonly health: HealthClient;
  readonly jobs: JobsClient;
  readonly menuLinkLists: MenuLinkListsClient;
  readonly modules: ModulesClient;
  readonly notifications: NotificationsClient;
  readonly oauthApps: OAuthAppsClient;
  readonly orders: OrdersClient;
  readonly organizationMemberships: OrganizationMembershipsClient;
  readonly packageTypes: PackageTypesClient;
  readonly pageBuilder: PageBuilderClient;
  readonly personalization: PersonalizationClient;
  readonly pickupLocations: PickupLocationsClient;
  readonly platform: PlatformClient;
  readonly pricing: PricingClient;
  readonly promotions: PromotionsClient;
  readonly quotes: QuotesClient;
  readonly roles: RolesClient;
  readonly searchIndexes: SearchIndexesClient;
  readonly seoInfos: SeoInfosClient;
  readonly settings: SettingsClient;
  readonly stores: StoresClient;
  readonly users: UsersClient;
  readonly whiteLabeling: WhiteLabelingClient;

  constructor(httpClient: HttpClient, storeId: string) {
    this.assets = new AssetsClient(httpClient);
    this.catalog = new CatalogClient(httpClient);
    this.completeness = new CompletenessClient(httpClient);
    this.content = new ContentClient(httpClient, storeId);
    this.currencies = new CurrenciesClient(httpClient);
    this.customers = new CustomersClient(httpClient);
    this.dynamicContent = new DynamicContentClient(httpClient);
    this.dynamicProperties = new DynamicPropertiesClient(httpClient);
    this.health = new HealthClient(httpClient);
    this.jobs = new JobsClient(httpClient);
    this.menuLinkLists = new MenuLinkListsClient(httpClient, storeId);
    this.modules = new ModulesClient(httpClient);
    this.notifications = new NotificationsClient(httpClient);
    this.oauthApps = new OAuthAppsClient(httpClient);
    this.orders = new OrdersClient(httpClient);
    this.organizationMemberships = new OrganizationMembershipsClient(httpClient);
    this.packageTypes = new PackageTypesClient(httpClient);
    this.pageBuilder = new PageBuilderClient(httpClient);
    this.personalization = new PersonalizationClient(httpClient);
    this.pickupLocations = new PickupLocationsClient(httpClient);
    this.platform = new PlatformClient(httpClient);
    this.pricing = new PricingClient(httpClient);
    this.promotions = new PromotionsClient(httpClient);
    this.quotes = new QuotesClient(httpClient);
    this.roles = new RolesClient(httpClient);
    this.searchIndexes = new SearchIndexesClient(httpClient);
    this.seoInfos = new SeoInfosClient(httpClient);
    this.settings = new SettingsClient(httpClient);
    this.stores = new StoresClient(httpClient);
    this.users = new UsersClient(httpClient);
    this.whiteLabeling = new WhiteLabelingClient(httpClient);
  }
}
