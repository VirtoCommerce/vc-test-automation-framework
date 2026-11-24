import type { ModuleRequirement } from "@virtocommerce/test-automation-framework/modules";

/**
 * The platform modules that the dataset and the tests of the Virto Commerce test suite depend on. The seed manifest and
 * the tests share them, so a collection that the seed skips and the tests that use its data skip for the same reason.
 *
 * @remarks
 * Each `minVersion` is the version that the suite is proven on: the edge version installed on the local platform on
 * 2026-11-18. Raise it when the suite starts to rely on a newer fix or feature, and lower it only after a successful run
 * on the older version.
 */
export const MODULES = {
  /**
   * The AngularJS back office (Commerce Manager). Part of the platform up to 3.1092.0, and a module from 3.1093.0
   * (VCST-6338).
   */
  adminAngularJs: { id: "VirtoCommerce.AdminAngularJs", minVersion: "3.1096.0" },
  backgroundJobs: { id: "VirtoCommerce.BackgroundJobs", minVersion: "3.1055.0" },
  catalog: { id: "VirtoCommerce.Catalog", minVersion: "3.1052.0" },
  core: { id: "VirtoCommerce.Core", minVersion: "3.1013.0" },
  customer: { id: "VirtoCommerce.Customer", minVersion: "3.1033.0" },
  inventory: { id: "VirtoCommerce.Inventory", minVersion: "3.1011.0" },
  marketing: { id: "VirtoCommerce.Marketing", minVersion: "3.1010.0" },
  notifications: { id: "VirtoCommerce.Notifications", minVersion: "3.1018.0" },
  orders: { id: "VirtoCommerce.Orders", minVersion: "3.1021.0" },
  /** Page builder. The shell queries its page lists with `POST /api/page-builder-pages/list` (3.1039.0). */
  pageBuilder: { id: "VirtoCommerce.PageBuilderModule", minVersion: "3.1041.0" },
  payment: { id: "VirtoCommerce.Payment", minVersion: "3.1011.0" },
  pickup: { id: "VirtoCommerce.XPickup", minVersion: "3.1010.0" },
  pricing: { id: "VirtoCommerce.Pricing", minVersion: "3.1010.0" },
  quote: { id: "VirtoCommerce.Quote", minVersion: "3.1008.0" },
  shipping: { id: "VirtoCommerce.Shipping", minVersion: "3.1010.0" },
  store: { id: "VirtoCommerce.Store", minVersion: "3.1013.0" },
  whiteLabeling: { id: "VirtoCommerce.WhiteLabeling", minVersion: "3.1007.0" },
  /** Marketing xAPI: `promotionCoupons` (3.1002.0, VCST-4590) with its `sort` applied (3.1003.0, VCST-5022). */
  xMarketing: { id: "VirtoCommerce.MarketingExperienceApi", minVersion: "3.1006.0" },
  /**
   * Profile xAPI: organization statuses, invites and member status per organization (3.1016.0, VCST-5281), company
   * roles per store (3.1018.0, VCST-5450), and organization locks per user (3.1019.0, VCST-5317).
   */
  xProfile: { id: "VirtoCommerce.ProfileExperienceApiModule", minVersion: "3.1025.0" },
} as const satisfies Readonly<Record<string, ModuleRequirement>>;

/**
 * Why the page builder tests are skipped: the page builder module is being replaced by the site builder module. Remove
 * the skips, or the tests, once the migration settles what stays.
 */
export const PAGE_BUILDER_REPLACED = "The page builder module is being replaced by the site builder module";
