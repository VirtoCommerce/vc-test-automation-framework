import type { ModuleRequirement } from "@core/modules";

/**
 * The platform modules the dataset and the tests depend on, shared by the seed manifest and `requiresModules`,
 * so a collection the seed skips and the tests that use its data skip for the same reason. A version range is
 * the range the suite is proven on: raise `minVersion` when the suite starts relying on a newer fix, lower it
 * only after a green run on the older version.
 */
export const MODULES = {
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
} as const satisfies Readonly<Record<string, ModuleRequirement>>;
