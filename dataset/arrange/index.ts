import type { ApiSession } from "@api/api-session";
import type { CleanupStack } from "@core/cleanup-stack";
import type { Dataset } from "../dataset";
import type { StoreUnderTest } from "../store-under-test";

import { Mailbox } from "@api/mailbox";

import { CartArrange } from "./carts";
import { CatalogArrange } from "./catalog";
import { ContentArrange } from "./content";
import { CustomerArrange } from "./customers";
import { MarketingArrange } from "./marketing";
import { OrderArrange } from "./orders";
import { PickupArrange } from "./pickup";
import { PlatformArrange } from "./platform";
import { PricingArrange } from "./pricing";
import { SecurityArrange } from "./security";

export type { ArrangedCart, ArrangedShoppingList, CartArrange, ItemToAdd } from "./carts";
export type { CatalogArrange } from "./catalog";
export type { ArrangedAsset, ArrangedContentFile, ContentArrange } from "./content";
export type { ArrangeContext } from "./context";
export type { CustomerAccount, CustomerArrange, SavedAddress } from "./customers";
export type { MarketingArrange } from "./marketing";
export type { ArrangedQuote, OrderArrange, OrderLine } from "./orders";
export type { ArrangedPickupLocations, PickupArrange } from "./pickup";
export type { PlatformArrange } from "./platform";
export type { PricingArrange } from "./pricing";
export type { ArrangedApiKey, PlatformAccount, SecurityArrange } from "./security";

/** Constructor options of {@link Arrange}. */
export interface ArrangeOptions {
  /** Store administrator session that creates and deletes the data. */
  readonly admin: ApiSession;
  /** Stack that receives every cleanup action. */
  readonly cleanup: CleanupStack;
  readonly dataset: Dataset;
  readonly store: StoreUnderTest;
}

/**
 * The `arrange` fixture: creates test data and registers its removal, which runs after the test in reverse order
 * (LIFO), so tests never clean up themselves. Data is created as the store administrator, except carts, lists,
 * quotes and member addresses, which are created in the given `shopper` session. `…Later` methods create nothing:
 * they only register cleanup for data the code under test creates. Methods are grouped by domain:
 *
 * - `customers`: organizations, members, signed-in frontend customers, memberships, member addresses.
 * - `security`: back-office users, API keys, roles, OAuth apps, signed-in sessions.
 * - `catalog`: catalogs, categories, products, tags, product configurations, completeness channels.
 * - `pricing`: pricelists, prices, pricelist assignments.
 * - `marketing`: promotions, dynamic content.
 * - `orders`: orders and quotes.
 * - `carts`: carts and shopping lists in a shopper's session.
 * - `pickup`: pickup locations and waiting for pickup searches.
 * - `content`: asset and content files, menu link lists, page builder pages.
 * - `platform`: stores, store and global settings, dictionaries, dynamic properties, white-labeling.
 *
 * @example
 * const customer = await arrange.customers.customerAccount();
 * const cart = await arrange.carts.cart(customer.api, [{ productId: laptop.id, quantity: 1 }]);
 * arrange.orders.deleteOrdersOfLater(customer.userId);
 */
export class Arrange {
  /** Store administrator session, for reading platform state in assertions. */
  readonly admin: ApiSession;
  /** Outgoing platform e-mails, read as the administrator. */
  readonly mailbox: Mailbox;
  readonly customers: CustomerArrange;
  readonly security: SecurityArrange;
  readonly catalog: CatalogArrange;
  readonly pricing: PricingArrange;
  readonly marketing: MarketingArrange;
  readonly orders: OrderArrange;
  readonly carts: CartArrange;
  readonly pickup: PickupArrange;
  readonly content: ContentArrange;
  readonly platform: PlatformArrange;

  constructor(options: ArrangeOptions) {
    this.admin = options.admin;
    this.mailbox = new Mailbox(options.admin.rest.notifications);
    this.security = new SecurityArrange(options);
    this.customers = new CustomerArrange(options, this.security);
    this.catalog = new CatalogArrange(options);
    this.pricing = new PricingArrange(options);
    this.marketing = new MarketingArrange(options);
    this.orders = new OrderArrange(options);
    this.carts = new CartArrange(options);
    this.pickup = new PickupArrange(options);
    this.content = new ContentArrange(options);
    this.platform = new PlatformArrange(options);
  }
}
