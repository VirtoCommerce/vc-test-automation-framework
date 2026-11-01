import type { ModuleRequirement } from "@core/modules";

/**
 * The platform modules the dataset and the tests depend on, shared by the seed manifest and `requiresModules`,
 * so a collection the seed skips and the tests that use its data skip for the same reason. A version range is
 * the range the suite is proven on: raise `minVersion` when the suite starts relying on a newer fix, lower it
 * only after a green run on the older version. One entry per module: its minimum covers every feature of the module
 * the suite uses, and its JSDoc says which feature needs which version.
 */
export const MODULES = {
  /**
   * The AngularJS back office (Commerce Manager): the `platform` app. Part of the platform up to 3.1092.0, a module
   * from 3.1093.0 (VCST-6338).
   */
  adminAngularJs: { id: "VirtoCommerce.AdminAngularJs" },
  backgroundJobs: { id: "VirtoCommerce.BackgroundJobs" },
  core: { id: "VirtoCommerce.Core" },
  catalog: { id: "VirtoCommerce.Catalog" },
  customer: { id: "VirtoCommerce.Customer" },
  inventory: { id: "VirtoCommerce.Inventory" },
  marketing: { id: "VirtoCommerce.Marketing" },
  notifications: { id: "VirtoCommerce.Notifications" },
  orders: { id: "VirtoCommerce.Orders" },
  pageBuilder: { id: "VirtoCommerce.PageBuilderModule", minVersion: "3.1034.0" },
  payment: { id: "VirtoCommerce.Payment" },
  pickup: { id: "VirtoCommerce.XPickup" },
  pricing: { id: "VirtoCommerce.Pricing" },
  quote: { id: "VirtoCommerce.Quote" },
  shipping: { id: "VirtoCommerce.Shipping" },
  store: { id: "VirtoCommerce.Store" },
  whiteLabeling: { id: "VirtoCommerce.WhiteLabeling" },
  /**
   * Marketing xAPI: `promotionCoupons` (3.1002.0, VCST-4590) with its `sort` applied (3.1003.0, VCST-5022).
   */
  xMarketing: { id: "VirtoCommerce.MarketingExperienceApi", minVersion: "3.1003.0" },
  /**
   * Profile xAPI: organization statuses, invites and per-organization member status (3.1016.0, VCST-5281), company
   * roles per store (3.1018.0, VCST-5450), and organization locks per user (3.1019.0, VCST-5317).
   */
  xProfile: { id: "VirtoCommerce.ProfileExperienceApiModule", minVersion: "3.1019.0" },
} as const satisfies Readonly<Record<string, ModuleRequirement>>;
