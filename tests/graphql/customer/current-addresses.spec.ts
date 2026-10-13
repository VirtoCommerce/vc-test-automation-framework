import type { ApiSession } from "@api/api-session";
import type { GetCurrentCustomerAddressesQueryVariables, InputMemberAddressType } from "@api/graphql/generated/graphql";
import type { CustomerAccount } from "@dataset/arrange";

import * as allure from "allure-js-commons";

import {
  GetCurrentCustomerAddressesDocument,
  GetCurrentOrganizationAddressesDocument,
} from "@api/graphql/generated/graphql";
import { INDEX_LAG_TIMEOUT_MS } from "@core/poll";
import { requireDefined } from "@core/required-fields";
import { uniqueId } from "@core/unique-id";
import { newMemberAddress } from "@dataset/builders/address";
import { expect, test } from "@fixtures";

type AddressQuery = GetCurrentCustomerAddressesQueryVariables;

const ALL_ADDRESSES = 200;

const SCOPES = [
  {
    scope: "customer",
    ownerOf: (customer: CustomerAccount) => customer.contactId,
    otherOwnerOf: (customer: CustomerAccount) => customer.organizationId,
    list: async (api: ApiSession, query: AddressQuery) =>
      (await api.graphql.execute(GetCurrentCustomerAddressesDocument, query)).currentCustomerAddresses,
    errors: async (api: ApiSession) => (await api.graphql.executeRaw(GetCurrentCustomerAddressesDocument, {})).errors,
  },
  {
    scope: "organization",
    ownerOf: (customer: CustomerAccount) => customer.organizationId,
    otherOwnerOf: (customer: CustomerAccount) => customer.contactId,
    list: async (api: ApiSession, query: AddressQuery) =>
      (await api.graphql.execute(GetCurrentOrganizationAddressesDocument, query)).currentOrganizationAddresses,
    errors: async (api: ApiSession) =>
      (await api.graphql.executeRaw(GetCurrentOrganizationAddressesDocument, {})).errors,
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

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Customer / Current Addresses");
});

for (const { scope, ownerOf, otherOwnerOf, list, errors } of SCOPES) {
  test.describe(`current ${scope} addresses (customer of their own)`, () => {
    test("list addresses with a total count", async ({ arrange }) => {
      await allure.story("List");
      await allure.description(`A customer's ${scope} addresses are listed and counted.`);
      const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
      const draft = newMemberAddress(`test-${scope}-address`);
      await test.step("arrange: one address", () =>
        arrange.customers.memberAddress(customer.api, ownerOf(customer), draft));

      await test.step("act and assert: exactly the arranged address is listed and counted", async () => {
        await expect
          .poll(
            async () => {
              const page = await list(customer.api, { first: ALL_ADDRESSES });
              return { totalCount: page?.totalCount, descriptions: page?.items?.map((item) => item?.description) };
            },
            { timeout: INDEX_LAG_TIMEOUT_MS },
          )
          .toEqual({ totalCount: 1, descriptions: [draft.description] });
      });
    });

    test("return every address field", async ({ arrange }) => {
      await allure.story("List");
      await allure.description(`A listed ${scope} address carries every field that was saved.`);
      const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
      const draft = newMemberAddress(`test-${scope}-address`);
      await test.step("arrange: one address", () =>
        arrange.customers.memberAddress(customer.api, ownerOf(customer), draft));

      await test.step("act and assert: the listed address has every saved field", async () => {
        await expect
          .poll(
            async () =>
              (await list(customer.api, { first: ALL_ADDRESSES }))?.items?.find(
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
      await allure.story("Paging");
      await allure.description("Asking for one address returns one, with the total count of all.");
      const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
      const drafts = [newMemberAddress(`test-${scope}-a`), newMemberAddress(`test-${scope}-b`)];
      await test.step("arrange: two listed addresses", async () => {
        await arrange.customers.memberAddresses(customer.api, ownerOf(customer), drafts);
        await expect
          .poll(async () => (await list(customer.api, { first: ALL_ADDRESSES }))?.totalCount, {
            timeout: INDEX_LAG_TIMEOUT_MS,
          })
          .toBe(2);
      });

      const page = await test.step("act: request one address", () => list(customer.api, { first: 1 }));

      await test.step("assert: one address is returned out of two", () => {
        expect(page?.items).toHaveLength(1);
        expect(page?.totalCount).toBe(2);
      });
    });

    test("page forward with after", async ({ arrange }) => {
      await allure.story("Paging");
      await allure.description("Pages of one address follow the order of the unpaged list.");
      const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
      const drafts = ["a", "b", "c"].map((suffix) => newMemberAddress(`test-${scope}-${suffix}`));
      await test.step("arrange: three listed addresses", async () => {
        await arrange.customers.memberAddresses(customer.api, ownerOf(customer), drafts);
        await expect
          .poll(async () => (await list(customer.api, { first: ALL_ADDRESSES }))?.totalCount, {
            timeout: INDEX_LAG_TIMEOUT_MS,
          })
          .toBe(3);
      });
      const unpaged = await list(customer.api, { first: ALL_ADDRESSES });

      const pages = await test.step("act: read the first two pages of one address", async () => [
        await list(customer.api, { first: 1, after: "0" }),
        await list(customer.api, { first: 1, after: "1" }),
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
        await allure.story("Filters");
        await allure.description(`Filtering ${scope} addresses by ${by} returns only the matching address.`);
        const { matching, query } = filter();
        const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
        const wanted = newMemberAddress(`test-${scope}-address`, matching);
        const other = newMemberAddress(`test-${scope}-address`);
        await test.step(`arrange: an address matching the ${by} and one that does not`, async () => {
          await arrange.customers.memberAddresses(customer.api, ownerOf(customer), [wanted, other]);
          await expect
            .poll(async () => (await list(customer.api, { first: ALL_ADDRESSES }))?.totalCount, {
              timeout: INDEX_LAG_TIMEOUT_MS,
            })
            .toBe(2);
        });

        const page = await test.step(`act: filter by ${by}`, () => list(customer.api, query));

        await test.step("assert: only the matching address is returned", () => {
          expect(page?.items?.map((item) => item?.description)).toEqual([wanted.description]);
        });
      });
    }

    test("sort addresses by city ascending", async ({ arrange }) => {
      await allure.story("Sorting");
      await allure.description("Addresses saved out of city order come back sorted by city.");
      const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
      const suffix = uniqueId("sort");
      const cities = [`Zeta-${suffix}`, `Alpha-${suffix}`, `Mu-${suffix}`];
      await test.step("arrange: listed addresses saved out of city order", async () => {
        await arrange.customers.memberAddresses(
          customer.api,
          ownerOf(customer),
          cities.map((city) => newMemberAddress(`test-${scope}-address`, { city })),
        );
        await expect
          .poll(async () => (await list(customer.api, { first: ALL_ADDRESSES }))?.totalCount, {
            timeout: INDEX_LAG_TIMEOUT_MS,
          })
          .toBe(cities.length);
      });

      const page = await test.step("act: list the addresses sorted by city", () =>
        list(customer.api, { sort: "city:asc", first: ALL_ADDRESSES }));

      await test.step("assert: the addresses are in ascending city order", () => {
        expect(page?.items?.map((item) => item?.city)).toEqual(cities.toSorted());
      });
    });

    test(`only ${scope} addresses are returned`, async ({ arrange }) => {
      await allure.story("Scope");
      await allure.description(`The ${scope} list leaves out the addresses of the customer's other member.`);
      const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
      const own = newMemberAddress(`test-${scope}-address`);
      const others = newMemberAddress("test-other-address");
      await test.step(`arrange: an address on the ${scope} and one on the other member`, async () => {
        await arrange.customers.memberAddress(customer.api, ownerOf(customer), own);
        await arrange.customers.memberAddress(customer.api, otherOwnerOf(customer), others);
      });

      await test.step(`act and assert: only the ${scope} address is listed`, async () => {
        await expect
          .poll(
            async () => (await list(customer.api, { first: ALL_ADDRESSES }))?.items?.map((item) => item?.description),
            { timeout: INDEX_LAG_TIMEOUT_MS },
          )
          .toEqual([own.description]);
      });
    });
  });

  test.describe(`current ${scope} addresses (anonymous)`, () => {
    test("deny anonymous access", async ({ api }) => {
      await allure.story("Access");
      await allure.description(`An anonymous visitor cannot list ${scope} addresses.`);

      const found = await test.step("act: list the addresses anonymously", () => errors(api));

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
