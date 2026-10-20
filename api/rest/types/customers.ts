import type { WithRequired } from "@core/required-fields";
import type * as Rest from "../generated/rest-api";

import { shape } from "@core/record-shape";

export type ContactData = Rest.VirtoCommerceCustomerModuleCoreModelContact;
export type CustomerAddress = Rest.CustomerAddress;
export type EmployeeData = Rest.VirtoCommerceCustomerModuleCoreModelEmployee;
export type MemberData = Rest.VirtoCommerceCustomerModuleCoreModelMember;
export type MembersSearchCriteria = Rest.VirtoCommerceCustomerModuleCoreModelSearchMembersSearchCriteria;
export type OrganizationData = Rest.VirtoCommerceCustomerModuleCoreModelOrganization;
export type VendorData = Rest.VirtoCommerceCustomerModuleCoreModelVendor;
export type VendorSearchResult = Rest.VirtoCommerceCustomerModuleCoreModelSearchVendorSearchResult;

export interface MemberBaseData {
  id?: string | null;
  name?: string | null;
  memberType?: string | null;
}

export const MEMBER = shape<MemberBaseData>()("Member", ["id", "name", "memberType"]);
export type Member<Data extends MemberBaseData> = WithRequired<Data, (typeof MEMBER.fields)[number]>;
