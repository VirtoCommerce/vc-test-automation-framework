import type { ModuleRequirement } from "@core/modules";

/**
 * The platform modules the dataset and the tests depend on, shared by the seed manifest and `requiresModules`,
 * so a collection the seed skips and the tests that use its data skip for the same reason. A version range is
 * the range the suite is proven on: raise `minVersion` when the suite starts relying on a newer fix, lower it
 * only after a green run on the older version. Entries for one feature of a module are named after the feature,
 * so the reason for the minimum is visible where a test requires it.
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
  /**
   * Profile xAPI: a contact's organizations as `GetOrganizations` queries them, with `statuses` (3.1016.0) and
   * `isLockedForCurrentUser` (3.1019.0); for every test that runs the query, also through `arrange.customers`.
   */
  contactOrganizations: { id: "VirtoCommerce.ProfileExperienceApiModule", minVersion: "3.1019.0" },
  /** Profile xAPI: invitations to a given organization, `RegisterByInvitation.organizationId` (VCST-5281). */
  organizationInvites: { id: "VirtoCommerce.ProfileExperienceApiModule", minVersion: "3.1016.0" },
  /** Profile xAPI: company roles configured per store, `ChangeOrganizationContactRole.storeId` (VCST-5450). */
  storeCompanyRoles: { id: "VirtoCommerce.ProfileExperienceApiModule", minVersion: "3.1018.0" },
  /** Profile xAPI: per-user organization locks, `Organization.isLockedForCurrentUser` (VCST-5317). */
  organizationLocks: { id: "VirtoCommerce.ProfileExperienceApiModule", minVersion: "3.1019.0" },
  pricing: { id: "VirtoCommerce.Pricing" },
  quote: { id: "VirtoCommerce.Quote" },
  shipping: { id: "VirtoCommerce.Shipping" },
  store: { id: "VirtoCommerce.Store" },
  whiteLabeling: { id: "VirtoCommerce.WhiteLabeling" },
} as const satisfies Readonly<Record<string, ModuleRequirement>>;
