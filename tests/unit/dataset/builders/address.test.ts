import type { MemberAddressFragment } from "@api/graphql/generated/graphql";

import { expect, test } from "@playwright/test";

import { comparableAddress, memberAddressInput, newMemberAddress, TEST_ADDRESS } from "@dataset/builders/address";

const INPUT_FIELDS = {
  id: "address-1",
  key: "key-1",
  city: "Test City",
  countryCode: "USA",
  countryName: "United States of America",
  email: null,
  firstName: "John",
  middleName: null,
  lastName: "Doe",
  line1: "1 Test Street",
  line2: null,
  name: null,
  organization: null,
  phone: null,
  postalCode: "10001",
  regionId: "NY",
  regionName: "New York",
  zip: null,
  outerId: null,
  description: "test-address",
  addressType: 3,
};
const SAVED: MemberAddressFragment = { ...INPUT_FIELDS, isDefault: true, isFavorite: false };

test.describe("comparableAddress", () => {
  test("keeps only the location fields that were sent", () => {
    expect(comparableAddress(TEST_ADDRESS)).toEqual({
      countryCode: "USA",
      countryName: "United States of America",
      regionId: "NY",
      regionName: "New York",
      city: "Test City",
      line1: "1 Test Street",
    });
  });
});

test.describe("newMemberAddress", () => {
  test("gives the address a unique key, description and street", () => {
    const [first, second] = [newMemberAddress("test-address"), newMemberAddress("test-address")];

    expect(first.description).toMatch(/^test-address-[0-9a-f]{8}$/);
    expect(first.key).toBe(first.description);
    expect(first.line1).toBe(`${TEST_ADDRESS.line1} #${first.description}`);
    expect(first.description).not.toBe(second.description);
  });

  test("applies the overrides", () => {
    expect(newMemberAddress("test-address", { city: "Berlin" }).city).toBe("Berlin");
  });
});

test.describe("memberAddressInput", () => {
  test("leaves out the query-only fields", () => {
    expect(memberAddressInput(SAVED)).toEqual(INPUT_FIELDS);
  });

  test("names the address that lacks a required field", () => {
    expect(() => memberAddressInput({ ...SAVED, city: null })).toThrow(/Address address-1/);
  });
});
