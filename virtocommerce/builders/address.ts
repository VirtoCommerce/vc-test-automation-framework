import type { InputAddressType, InputMemberAddressType, MemberAddressFragment } from "../graphql/generated/graphql.ts";

import { requireFields } from "../support/require-fields.ts";
import { uniqueId } from "../support/unique-id.ts";

/** A member address to save, with a unique description that finds it again. */
export type MemberAddressDraft = InputMemberAddressType & { readonly description: string };

const BILLING_AND_SHIPPING = 3;
const COMPARED_FIELDS = ["countryCode", "countryName", "regionId", "regionName", "city", "line1", "line2"] as const;

/** A complete billing and shipping address in the United States. */
export const TEST_ADDRESS = {
  firstName: "John",
  lastName: "Doe",
  line1: "1 Test Street",
  city: "Test City",
  countryCode: "USA",
  countryName: "United States of America",
  postalCode: "10001",
  regionId: "NY",
  regionName: "New York",
  phone: "+1 (555) 000-0000",
  email: "john.doe@test.com",
  addressType: BILLING_AND_SHIPPING,
} as const satisfies InputAddressType;

/**
 * Returns the fields of an address that the platform returns as sent, for `toMatchObject`.
 *
 * @param address - The address that was sent.
 * @returns The country, region, city and street of the address.
 */
export function comparableAddress(address: InputAddressType): Partial<InputAddressType> {
  return Object.fromEntries(
    COMPARED_FIELDS.filter((field) => address[field] !== undefined).map((field) => [field, address[field]]),
  );
}

/**
 * Returns a new member address based on {@link TEST_ADDRESS}, with a unique street, key and description.
 *
 * @param prefix - What the address is for, such as `test-contact-address`.
 * @param overrides - Fields to change, such as `city`.
 * @returns The address.
 */
export function newMemberAddress(prefix: string, overrides: Partial<InputMemberAddressType> = {}): MemberAddressDraft {
  const unique = uniqueId(prefix);
  return { ...TEST_ADDRESS, line1: `${TEST_ADDRESS.line1} #${unique}`, ...overrides, key: unique, description: unique };
}

/**
 * Returns a saved member address as the input that updates or deletes it.
 *
 * @param address - The address as xAPI returns it.
 * @returns The input, without the read-only `isDefault` and `isFavorite`.
 * @throws {Error} The address has no city, country, street or postal code.
 */
export function memberAddressInput({
  isDefault: _isDefault,
  isFavorite: _isFavorite,
  ...address
}: MemberAddressFragment): InputMemberAddressType {
  return requireFields(address, ["city", "countryCode", "line1", "postalCode"], `Address ${address.id}`);
}
