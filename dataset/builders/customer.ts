import type {
  ContactData,
  CustomerAddress,
  EmployeeData,
  OrganizationData,
  VendorData,
} from "@api/rest/types/customers";
import type { WithRequired } from "@core/required-fields";
import type { UserDraft } from "./security";

import { randomUUID } from "node:crypto";

import { uniqueId } from "@core/unique-id";

import { TEST_ADDRESS } from "./address";
import { newPassword } from "./security";

/** An organization to create, with its id chosen up front. */
export type OrganizationDraft = WithRequired<OrganizationData, "id" | "name">;

/** A contact to create, with its id chosen up front. */
export type ContactDraft = WithRequired<ContactData, "id" | "name" | "firstName" | "lastName">;

/** An employee to create, with its id chosen up front. */
export type EmployeeDraft = WithRequired<EmployeeData, "id" | "name" | "firstName" | "lastName">;

/** A vendor to create, with its id chosen up front. */
export type VendorDraft = WithRequired<VendorData, "id" | "name">;

/**
 * Builds an approved organization with a random id.
 *
 * @param name - Unique `test-organization-…` by default.
 */
export function newOrganization(name = uniqueId("test-organization")): OrganizationDraft {
  return { id: randomUUID(), memberType: "Organization", name, status: "Approved" };
}

/**
 * Builds an approved contact `Test Customer-…` with a random id.
 *
 * @param organizationId - Makes the contact a member of this organization and its default one; none by default.
 */
export function newContact(organizationId?: string): ContactDraft {
  const lastName = uniqueId("Customer");
  const contact: ContactDraft = {
    id: randomUUID(),
    memberType: "Contact",
    firstName: "Test",
    lastName,
    name: `Test ${lastName}`,
    status: "Approved",
  };
  return organizationId === undefined
    ? contact
    : { ...contact, organizations: [organizationId], defaultOrganizationId: organizationId };
}

/** Builds an employee `Test Employee-…` with a random id. */
export function newEmployee(): EmployeeDraft {
  const lastName = uniqueId("Employee");
  return { id: randomUUID(), memberType: "Employee", firstName: "Test", lastName, name: `Test ${lastName}` };
}

/** Builds a vendor named `test-vendor-…` with a random id. */
export function newVendor(): VendorDraft {
  return { id: randomUUID(), memberType: "Vendor", name: uniqueId("test-vendor") };
}

/**
 * Builds a REST member address from {@link TEST_ADDRESS}, billing and shipping, with a unique `line1`.
 * For xAPI use `newMemberAddress`.
 */
export function newCustomerAddress(): CustomerAddress {
  const { addressType: _graphqlAddressType, ...address } = TEST_ADDRESS;
  return { ...address, line1: `${TEST_ADDRESS.line1} #${uniqueId("address")}`, addressType: "BillingAndShipping" };
}

/**
 * Builds an approved frontend customer user of a contact, with a confirmed unique `test-customer-…@example.com`
 * user name and email and a random password. For admin users use `newPlatformUser`.
 *
 * @param storeId - The store the user signs in to.
 * @param memberId - The user's contact.
 * @param roles - Dataset roles, as `{ id, name }`.
 */
export function newCustomerUser(
  storeId: string,
  memberId: string,
  roles: readonly { readonly id: string; readonly name: string }[],
): UserDraft {
  const userName = `${uniqueId("test-customer")}@example.com`;
  return {
    userName,
    email: userName,
    password: newPassword(),
    userType: "Customer",
    storeId,
    memberId,
    status: "Approved",
    emailConfirmed: true,
    roles: roles.map((role) => ({ ...role })),
  };
}
