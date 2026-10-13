import type { InputAddressType, InputMemberAddressType, MemberAddressFragment } from "@api/graphql/generated/graphql";

import { requireFields } from "@core/required-fields";
import { uniqueId } from "@core/unique-id";

const BILLING_AND_SHIPPING = 3;

/** A member address for xAPI; its unique description finds it again among the member's addresses. */
export type MemberAddressDraft = InputMemberAddressType & { readonly description: string };

/** A complete US (New York) billing-and-shipping address for carts, payments, shipments and quotes. */
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

const COMPARED_FIELDS = ["countryCode", "countryName", "regionId", "regionName", "city", "line1", "line2"] as const;

/** Picks the fields the platform stores as sent (country, region, city, street lines), to compare sent vs stored. */
export function comparableAddress(address: InputAddressType): Partial<InputAddressType> {
  return Object.fromEntries(
    COMPARED_FIELDS.filter((field) => address[field] !== undefined).map((field) => [field, address[field]]),
  );
}

/**
 * Builds an xAPI member address from {@link TEST_ADDRESS}; its key and description are one unique value,
 * which also suffixes `line1` as `#<unique>`.
 *
 * @param prefix - Starts the unique value, such as `test-organization-address`.
 */
export function newMemberAddress(prefix: string, overrides: Partial<InputMemberAddressType> = {}): MemberAddressDraft {
  const unique = uniqueId(prefix);
  return { ...TEST_ADDRESS, line1: `${TEST_ADDRESS.line1} #${unique}`, ...overrides, key: unique, description: unique };
}

/**
 * Turns a queried member address into a mutation input, for updating or deleting it.
 * Drops the query-only `isDefault` and `isFavorite`, which the platform rejects as input.
 *
 * @throws Error when the address lacks `city`, `countryCode`, `line1` or `postalCode`.
 */
export function memberAddressInput({
  isDefault: _isDefault,
  isFavorite: _isFavorite,
  ...address
}: MemberAddressFragment): InputMemberAddressType {
  return requireFields(address, ["city", "countryCode", "line1", "postalCode"], `Address ${address.id}`);
}
