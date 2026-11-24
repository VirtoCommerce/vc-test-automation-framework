import type { Customer, Shopper } from "@fixtures";
import type { GetCurrentCustomerAddressesQueryVariables, InputMemberAddressType } from "@graphql/generated/graphql.ts";

import { newMemberAddress } from "@builders/address.ts";
import { expect, test } from "@fixtures";
import {
  GetCurrentCustomerAddressesDocument,
  GetCurrentOrganizationAddressesDocument,
} from "@graphql/generated/graphql.ts";
import { INDEX_LAG_TIMEOUT_MS } from "@support/poll.ts";
import { requireDefined } from "@support/require-fields.ts";
import { uniqueId } from "@support/unique-id.ts";

type AddressQuery = GetCurrentCustomerAddressesQueryVariables;

const ALL_ADDRESSES = 200;

const SCOPES = [
  {
    scope: "customer",
    ownerOf: (customer: Customer) => customer.contactId,
    otherOwnerOf: (customer: Customer) => customer.organizationId,
    list: async (shopper: Shopper, query: AddressQuery) =>
      (await shopper.graphql.execute(GetCurrentCustomerAddressesDocument, query)).currentCustomerAddresses,
    errors: async (shopper: Shopper) =>
      (await shopper.graphql.executeRaw(GetCurrentCustomerAddressesDocument, {})).errors,
  },
  {
    scope: "organization",
    ownerOf: (customer: Customer) => customer.organizationId,
    otherOwnerOf: (customer: Customer) => customer.contactId,
    list: async (shopper: Shopper, query: AddressQuery) =>
      (await shopper.graphql.execute(GetCurrentOrganizationAddressesDocument, query)).currentOrganizationAddresses,
    errors: async (shopper: Shopper) =>
      (await shopper.graphql.executeRaw(GetCurrentOrganizationAddressesDocument, {})).errors,
  },
] as const;

const FILTERS: readonly {
  readonly by: string;
  readonly filter: () => { readonly matching: Partial<InputMemberAddressType>; readonly query: AddressQuery };
}[] = [
  {
    by: "country",
    filter: () => ({
      matching: { countryCode: "CAN", countryName: "Canada", regionId: "ON", regionName: "Ontario" },
      query: { countryCodes: ["CAN"] },
    }),
  },
  {
    by: "region",
    filter: () => ({ matching: { regionId: "NJ", regionName: "New Jersey" }, query: { regionIds: ["NJ"] } }),
  },
  {
    by: "city",
    filter: () => {
      const city = uniqueId("City");
      return { matching: { city }, query: { cities: [city] } };
    },
  },
  {
    by: "keyword",
    filter: () => {
      const keyword = uniqueId("kw").replaceAll("-", "");
      return { matching: { line1: `1 ${keyword} Street` }, query: { keyword } };
    },
  },
];

for (const { scope, ownerOf, otherOwnerOf, list, errors } of SCOPES) {
  test.describe(`current ${scope} addresses (customer of their own)`, () => {
    test("list addresses with a total count", async ({ arrange }) => {
      const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customer());
      const draft = newMemberAddress(`test-${scope}-address`);
      await test.step("arrange: one address", () =>
        arrange.customers.memberAddress(customer, ownerOf(customer), draft));

      await test.step("act and assert: exactly the arranged address is listed and counted", async () => {
        await expect
          .poll(
            async () => {
              const page = await list(customer, { first: ALL_ADDRESSES });
              return { totalCount: page?.totalCount, descriptions: page?.items?.map((item) => item?.description) };
            },
            { timeout: INDEX_LAG_TIMEOUT_MS },
          )
          .toEqual({ totalCount: 1, descriptions: [draft.description] });
      });
    });

    test("return every address field", async ({ arrange }) => {
      const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customer());
      const draft = newMemberAddress(`test-${scope}-address`);
      await test.step("arrange: one address", () =>
        arrange.customers.memberAddress(customer, ownerOf(customer), draft));

      await test.step("act and assert: the listed address has every saved field", async () => {
        await expect
          .poll(
            async () =>
              (await list(customer, { first: ALL_ADDRESSES }))?.items?.find(
                (item) => item?.description === draft.description,
              ),
            { timeout: INDEX_LAG_TIMEOUT_MS },
          )
          .toMatchObject({
            id: expect.any(String),
            city: draft.city,
            countryCode: draft.countryCode,
            countryName: draft.countryName,
            regionId: draft.regionId,
            regionName: draft.regionName,
            line1: draft.line1,
            postalCode: draft.postalCode,
            firstName: draft.firstName,
            lastName: draft.lastName,
            addressType: draft.addressType,
          });
      });
    });

    test("limit a page with first", async ({ arrange }) => {
      const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customer());
      const drafts = [newMemberAddress(`test-${scope}-a`), newMemberAddress(`test-${scope}-b`)];
      await test.step("arrange: two listed addresses", async () => {
        await arrange.customers.memberAddresses(customer, ownerOf(customer), drafts);
        await expect
          .poll(async () => (await list(customer, { first: ALL_ADDRESSES }))?.totalCount, {
            timeout: INDEX_LAG_TIMEOUT_MS,
          })
          .toBe(2);
      });

      const page = await test.step("act: request one address", () => list(customer, { first: 1 }));

      await test.step("assert: one address is returned out of two", () => {
        expect(page?.items).toHaveLength(1);
        expect(page?.totalCount).toBe(2);
      });
    });

    test("page forward with after", async ({ arrange }) => {
      const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customer());
      const drafts = ["a", "b", "c"].map((suffix) => newMemberAddress(`test-${scope}-${suffix}`));
      await test.step("arrange: three listed addresses", async () => {
        await arrange.customers.memberAddresses(customer, ownerOf(customer), drafts);
        await expect
          .poll(async () => (await list(customer, { first: ALL_ADDRESSES }))?.totalCount, {
            timeout: INDEX_LAG_TIMEOUT_MS,
          })
          .toBe(3);
      });
      const unpaged = await list(customer, { first: ALL_ADDRESSES });

      const pages = await test.step("act: read the first two pages of one address", async () => [
        await list(customer, { first: 1, after: "0" }),
        await list(customer, { first: 1, after: "1" }),
      ]);

      await test.step("assert: the pages follow the unpaged order", () => {
        expect(pages.map((page) => page?.items?.map((item) => item?.id))).toEqual([
          [unpaged?.items?.[0]?.id],
          [unpaged?.items?.[1]?.id],
        ]);
      });
    });

    for (const { by, filter } of FILTERS) {
      test(`filter addresses by ${by}`, async ({ arrange }) => {
        const { matching, query } = filter();
        const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customer());
        const wanted = newMemberAddress(`test-${scope}-address`, matching);
        const other = newMemberAddress(`test-${scope}-address`);
        await test.step(`arrange: an address matching the ${by} and one that does not`, async () => {
          await arrange.customers.memberAddresses(customer, ownerOf(customer), [wanted, other]);
          await expect
            .poll(async () => (await list(customer, { first: ALL_ADDRESSES }))?.totalCount, {
              timeout: INDEX_LAG_TIMEOUT_MS,
            })
            .toBe(2);
        });

        const page = await test.step(`act: filter by ${by}`, () => list(customer, query));

        await test.step("assert: only the matching address is returned", () => {
          expect(page?.items?.map((item) => item?.description)).toEqual([wanted.description]);
        });
      });
    }

    test("sort addresses by city ascending", async ({ arrange }) => {
      const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customer());
      const suffix = uniqueId("sort");
      const cities = [`Zeta-${suffix}`, `Alpha-${suffix}`, `Mu-${suffix}`];
      await test.step("arrange: listed addresses saved out of city order", async () => {
        await arrange.customers.memberAddresses(
          customer,
          ownerOf(customer),
          cities.map((city) => newMemberAddress(`test-${scope}-address`, { city })),
        );
        await expect
          .poll(async () => (await list(customer, { first: ALL_ADDRESSES }))?.totalCount, {
            timeout: INDEX_LAG_TIMEOUT_MS,
          })
          .toBe(cities.length);
      });

      const page = await test.step("act: list the addresses sorted by city", () =>
        list(customer, { sort: "city:asc", first: ALL_ADDRESSES }));

      await test.step("assert: the addresses are in ascending city order", () => {
        expect(page?.items?.map((item) => item?.city)).toEqual(cities.toSorted());
      });
    });

    test(`only ${scope} addresses are returned`, async ({ arrange }) => {
      const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customer());
      const own = newMemberAddress(`test-${scope}-address`);
      const others = newMemberAddress("test-other-address");
      await test.step(`arrange: an address on the ${scope} and one on the other member`, async () => {
        await arrange.customers.memberAddress(customer, ownerOf(customer), own);
        await arrange.customers.memberAddress(customer, otherOwnerOf(customer), others);
      });

      await test.step(`act and assert: only the ${scope} address is listed`, async () => {
        await expect
          .poll(async () => (await list(customer, { first: ALL_ADDRESSES }))?.items?.map((item) => item?.description), {
            timeout: INDEX_LAG_TIMEOUT_MS,
          })
          .toEqual([own.description]);
      });
    });
  });

  test.describe(`current ${scope} addresses (anonymous)`, () => {
    test("deny anonymous access", async ({ shopper }) => {
      const found = await test.step("act: list the addresses anonymously", () => errors(shopper));

      await test.step("assert: access is denied", () => {
        expect(
          requireDefined(found, "Error")
            .map(({ message }) => message)
            .join(" "),
        ).toMatch(/Forbidden|Access denied/);
      });
    });
  });
}
