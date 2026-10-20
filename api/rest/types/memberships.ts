import type { Shaped } from "@core/record-shape";
import type * as Rest from "../generated/rest-api";

import { shape } from "@core/record-shape";

export type LockMembershipRequest = Rest.VirtoCommerceCustomerModuleCoreModelLockMembershipRequest;
export type OrganizationMembershipData = Rest.VirtoCommerceCustomerModuleCoreModelOrganizationMembership;

export const ORGANIZATION_MEMBERSHIP = shape<OrganizationMembershipData>()("Organization membership", [
  "id",
  "userId",
  "organizationId",
]);
export type OrganizationMembership = Shaped<typeof ORGANIZATION_MEMBERSHIP>;
