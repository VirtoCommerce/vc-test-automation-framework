import type { CartsArrange } from "./carts.ts";
import type { CatalogArrange } from "./catalog.ts";
import type { ContentArrange } from "./content.ts";
import type { ArrangeContext } from "./context.ts";
import type { CustomersArrange } from "./customers.ts";
import type { Mailbox } from "./mailbox.ts";
import type { MarketingArrange } from "./marketing.ts";
import type { OrdersArrange } from "./orders.ts";
import type { PickupArrange } from "./pickup.ts";
import type { PlatformArrange } from "./platform.ts";
import type { PricingArrange } from "./pricing.ts";
import type { SecurityArrange } from "./security.ts";

import { test } from "@playwright/test";
import { errorMessage } from "@virtocommerce/test-automation-framework/core";

import { cartsArrange } from "./carts.ts";
import { catalogArrange } from "./catalog.ts";
import { contentArrange } from "./content.ts";
import { customersArrange } from "./customers.ts";
import { mailboxArrange } from "./mailbox.ts";
import { marketingArrange } from "./marketing.ts";
import { ordersArrange } from "./orders.ts";
import { pickupArrange } from "./pickup.ts";
import { platformArrange } from "./platform.ts";
import { pricingArrange } from "./pricing.ts";
import { securityArrange } from "./security.ts";

export type { ArrangedCart, ArrangedShoppingList, CartItem, CartsArrange } from "./carts.ts";
export type { ArrangedCatalog, ArrangedCategory, ArrangedProduct, CatalogArrange } from "./catalog.ts";
export type { ArrangedAsset, ArrangedContentFile, ArrangedPage, ContentArrange } from "./content.ts";
export type { ArrangeContext } from "./context.ts";
export type { ArrangedMember, Customer, CustomerOptions, CustomersArrange, SavedAddress } from "./customers.ts";
export type { Email, Mailbox, MailQuery } from "./mailbox.ts";
export type { MarketingArrange } from "./marketing.ts";
export type { ArrangedQuote, OrderLine, OrdersArrange } from "./orders.ts";
export type { ArrangedPickupLocation, ArrangedPickupLocations, PickupArrange } from "./pickup.ts";
export type { ArrangedDynamicProperty, PlatformArrange } from "./platform.ts";
export type { PricingArrange } from "./pricing.ts";
export type {
  ArrangedApiKey,
  ArrangedOAuthApp,
  ArrangedRole,
  PlatformAccount,
  PlatformUser,
  SecurityArrange,
} from "./security.ts";
export type { Shopper, StoreContext } from "./shopper.ts";

export { customerOf } from "./customers.ts";
export { linkParameter } from "./mailbox.ts";
export { shopperOf, signedInShopper } from "./shopper.ts";

/**
 * Creates test data and removes it after the test, last first, so tests have no teardown code. Data is created as
 * the store administrator, except carts, shopping lists, quotes and member addresses, which are created in a
 * shopper's session. `…Later` methods create nothing: they only remove data that the code under test creates. The
 * methods are grouped by domain:
 *
 * - `customers`: members, organizations, memberships, frontend customers and their addresses.
 * - `carts`: carts and shopping lists in a shopper's session.
 * - `orders`: orders and quotes.
 * - `catalog`: catalogs, categories, products, personalization tags and completeness channels.
 * - `pickup`: pickup locations, and waiting until xAPI offers them.
 * - `content`: assets, content files, menu link lists and page builder pages.
 * - `platform`: stores, dictionaries, dynamic properties and white-labeling settings.
 * - `mailbox`: the e-mails that the platform sends; it creates nothing.
 * - `security`: platform users, roles, API keys and OAuth apps.
 * - `pricing`: pricelists, prices and pricelist assignments.
 * - `marketing`: promotions and dynamic content.
 */
export interface Arrange {
  readonly customers: CustomersArrange;
  readonly carts: CartsArrange;
  readonly orders: OrdersArrange;
  readonly catalog: CatalogArrange;
  readonly pickup: PickupArrange;
  readonly content: ContentArrange;
  readonly platform: PlatformArrange;
  readonly mailbox: Mailbox;
  readonly security: SecurityArrange;
  readonly pricing: PricingArrange;
  readonly marketing: MarketingArrange;
}

/** The `arrange` of one test, and the removal of what it created. */
export interface ArrangeSession {
  readonly arrange: Arrange;
  /**
   * Runs the removal actions, last first, each as a `cleanup:` step. Every action runs, even after one fails.
   *
   * @throws {Error} An action failed, with the failures of all of them.
   */
  readonly cleanUp: () => Promise<void>;
}

/**
 * Returns the `arrange` of one test.
 *
 * @param context - The sign-in, sign-out and store that the domains use; `later` is supplied here.
 * @returns The `arrange` and its removal.
 */
export function createArrange(context: Omit<ArrangeContext, "later">): ArrangeSession {
  const undo: { readonly description: string; readonly action: () => Promise<unknown> }[] = [];
  const domainContext: ArrangeContext = {
    ...context,
    later: (description, action) => {
      undo.push({ description, action });
    },
  };
  const carts = cartsArrange(domainContext);

  async function cleanUp(): Promise<void> {
    const failures: string[] = [];
    for (const { description, action } of undo.reverse()) {
      try {
        await test.step(`cleanup: ${description}`, action);
      } catch (error) {
        failures.push(`${description}: ${errorMessage(error)}`);
      }
    }
    if (failures.length > 0) {
      throw new Error(`Cleanup failed:\n${failures.join("\n")}`);
    }
  }

  return {
    arrange: {
      customers: customersArrange(domainContext, carts),
      carts,
      orders: ordersArrange(domainContext),
      catalog: catalogArrange(domainContext),
      pickup: pickupArrange(domainContext),
      content: contentArrange(domainContext),
      platform: platformArrange(domainContext),
      mailbox: mailboxArrange(domainContext),
      security: securityArrange(domainContext),
      pricing: pricingArrange(domainContext),
      marketing: marketingArrange(domainContext),
    },
    cleanUp,
  };
}
