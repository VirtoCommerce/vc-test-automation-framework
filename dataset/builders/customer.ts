import type {
  ContactData,
  CustomerAddress,
  EmployeeData,
  MemberData,
  OrganizationData,
} from "@api/rest/types/customers";
import type { WithRequired } from "@core/required-fields";

import { uniqueId } from "@core/unique-id";

import { TEST_ADDRESS } from "./address";

export type ContactDraft = WithRequired<ContactData, "id" | "name" | "firstName" | "lastName">;
export type OrganizationDraft = WithRequired<OrganizationData, "id" | "name">;
export type EmployeeDraft = WithRequired<EmployeeData, "id" | "name" | "firstName" | "lastName">;
export type MemberDraft = WithRequired<MemberData, "id" | "name" | "memberType">;

export function newContact(organizationIds: string[] = []): ContactDraft {
  return {
    ...newPerson("Contact", "Testfirst"),
    ...(organizationIds.length === 0 ? {} : { organizations: organizationIds }),
  };
}

export function newOrganization(name = uniqueId("test-organization")): OrganizationDraft {
  return { id: crypto.randomUUID(), memberType: "Organization", name };
}

export function newEmployee(): EmployeeDraft {
  return newPerson("Employee", "Testemployee");
}

export function newMember(
  memberType: "Organization" | "Vendor" = "Organization",
  name = uniqueId("test-member"),
): MemberDraft {
  return { id: crypto.randomUUID(), memberType, name };
}

export function newAddress(): CustomerAddress {
  return {
    addressType: "BillingAndShipping",
    countryCode: TEST_ADDRESS.countryCode,
    countryName: TEST_ADDRESS.countryName,
    regionId: TEST_ADDRESS.regionId,
    city: TEST_ADDRESS.city,
    line1: `${uniqueId("test-street")} Main St`,
    postalCode: TEST_ADDRESS.postalCode,
  };
}

function newPerson<Type extends "Contact" | "Employee">(memberType: Type, firstNamePrefix: string) {
  const firstName = uniquePersonName(firstNamePrefix);
  const lastName = uniquePersonName("Testlast");
  return { id: crypto.randomUUID(), memberType, firstName, lastName, name: `${firstName} ${lastName}` };
}

function uniquePersonName(prefix: string): string {
  const letters = Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) =>
    String.fromCharCode(97 + (byte % 26)),
  ).join("");
  return `${prefix} ${letters.charAt(0).toUpperCase()}${letters.slice(1)}`;
}
