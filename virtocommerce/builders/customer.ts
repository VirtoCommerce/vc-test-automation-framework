import type {
  VirtoCommerceCustomerModuleCoreModelContact as Contact,
  CustomerAddress,
  VirtoCommerceCustomerModuleCoreModelEmployee as Employee,
  VirtoCommerceCustomerModuleCoreModelOrganization as Organization,
  VirtoCommerceCustomerModuleCoreModelVendor as Vendor,
} from "../rest/generated/platform.ts";

import { randomUUID } from "node:crypto";

import { uniqueId } from "../support/unique-id.ts";
import { TEST_ADDRESS } from "./address.ts";

/** A member to create, with its identifier and name. */
export interface MemberDraft {
  readonly id: string;
  readonly name: string;
  readonly memberType: string;
}

/**
 * Returns a new approved organization.
 *
 * @param name - A unique name by default.
 * @returns The organization.
 */
export function newOrganization(name = uniqueId("test-organization")): Organization & MemberDraft {
  return { id: randomUUID(), memberType: "Organization", name, status: "Approved" };
}

/**
 * Returns a new approved contact.
 *
 * @param organizationId - An organization of the contact, which becomes its default; none by default.
 * @returns The contact, with a unique last name.
 */
export function newContact(organizationId?: string): Contact & MemberDraft {
  const lastName = uniqueName("Customer");
  const contact = {
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

/**
 * Returns a new employee.
 *
 * @returns The employee, with a unique last name.
 */
export function newEmployee(): Employee & MemberDraft {
  const lastName = uniqueName("Employee");
  return { id: randomUUID(), memberType: "Employee", firstName: "Test", lastName, name: `Test ${lastName}` };
}

/**
 * Returns a new vendor.
 *
 * @returns The vendor, with a unique name.
 */
export function newVendor(): Vendor & MemberDraft {
  return { id: randomUUID(), memberType: "Vendor", name: uniqueId("test-vendor") };
}

/**
 * Returns a new billing and shipping address of a member, based on {@link TEST_ADDRESS}, with a unique street.
 *
 * @returns The address.
 */
export function newCustomerAddress(): CustomerAddress {
  const { addressType: _graphqlAddressType, ...address } = TEST_ADDRESS;
  return { ...address, line1: `${TEST_ADDRESS.line1} #${uniqueId("address")}`, addressType: "BillingAndShipping" };
}

function uniqueName(prefix: string): string {
  const letters = randomUUID()
    .replaceAll("-", "")
    .slice(0, 8)
    .replace(/\d/g, (digit) => String.fromCharCode("g".charCodeAt(0) + Number(digit)));
  return `${prefix} ${letters.charAt(0).toUpperCase()}${letters.slice(1)}`;
}
