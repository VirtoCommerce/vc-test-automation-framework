import type { CustomerAccount } from "@dataset/arrange";

import * as allure from "allure-js-commons";

import {
  AddAddressToFavoritesDocument,
  DeleteMemberAddressesDocument,
  GetContactAddressesDocument,
  RemoveAddressFromFavoritesDocument,
  UpdateMemberAddressesDocument,
} from "@api/graphql/generated/graphql";
import { comparableAddress, memberAddressInput, newMemberAddress } from "@dataset/builders/address";
import { STORE_ADMINISTRATOR } from "@dataset/users";
import { expect, test } from "@fixtures";

const OWNERS = [
  { owner: "contact", memberOf: (customer: CustomerAccount) => customer.contactId },
  { owner: "organization", memberOf: (customer: CustomerAccount) => customer.organizationId },
] as const;

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Customer / Addresses");
});

test.describe("member addresses (customer of their own)", () => {
  for (const { owner, memberOf } of OWNERS) {
    test(`add an address to the ${owner}`, async ({ arrange }) => {
      await allure.story("Add addresses");
      await allure.description(`A customer saves a new address on their ${owner}.`);
      const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
      const draft = newMemberAddress(`test-${owner}-address`);

      const { updateMemberAddresses } = await test.step(`act: save the address on the ${owner}`, () =>
        customer.api.graphql.execute(UpdateMemberAddressesDocument, {
          command: { memberId: memberOf(customer), addresses: [draft] },
        }));

      await test.step(`assert: the ${owner} has the address`, () => {
        expect(
          updateMemberAddresses?.addresses?.items?.find((address) => address?.description === draft.description),
        ).toMatchObject(comparableAddress(draft));
      });
    });

    test(`remove an address of the ${owner}`, async ({ api, arrange }) => {
      await allure.story("Remove addresses");
      await allure.description(
        `A customer deletes an address of their ${owner}; the ${owner}, read back by its id, no longer has it.`,
      );
      const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
      const address = await test.step(`arrange: an address of the ${owner}`, () =>
        arrange.customers.memberAddress(customer.api, memberOf(customer), newMemberAddress(`test-${owner}-address`)));
      const admin = await test.step("arrange: sign in as the store administrator", () => api.as(STORE_ADMINISTRATOR));

      const { deleteMemberAddresses } = await test.step("act: delete the address", () =>
        customer.api.graphql.execute(DeleteMemberAddressesDocument, {
          command: { memberId: memberOf(customer), addresses: [memberAddressInput(address)] },
        }));

      await test.step(`assert: the ${owner} no longer has the address`, async () => {
        const reloaded = await admin.rest.customers.members.get(memberOf(customer));
        expect(deleteMemberAddresses?.addresses?.items?.map((item) => item?.id)).not.toContain(address.id);
        expect(reloaded.addresses?.map(({ description }) => description)).not.toContain(address.description);
      });
    });
  }

  test("update an organization address", async ({ arrange }) => {
    await allure.story("Update addresses");
    await allure.description("A customer changes the city and street of an organization address.");
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
    const address = await test.step("arrange: an organization address", () =>
      arrange.customers.memberAddress(
        customer.api,
        customer.organizationId,
        newMemberAddress("test-organization-address"),
      ));
    const changes = { city: "Updated City", line1: `2 Updated Street ${address.description}` };

    const { updateMemberAddresses } = await test.step("act: change the city and street", () =>
      customer.api.graphql.execute(UpdateMemberAddressesDocument, {
        command: {
          memberId: customer.organizationId,
          addresses: [{ ...memberAddressInput(address), ...changes }],
        },
      }));

    await test.step("assert: the address has the new city and street", () => {
      expect(
        updateMemberAddresses?.addresses?.items?.find((item) => item?.description === address.description),
      ).toMatchObject({ id: address.id, ...changes });
    });
  });

  test("add an address to favorites and remove it", async ({ arrange }) => {
    await allure.story("Favorite addresses");
    await allure.description("A customer marks an address as a favorite and unmarks it again.");
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
    const { id: addressId } = await test.step("arrange: a contact address", () =>
      arrange.customers.memberAddress(customer.api, customer.contactId, newMemberAddress("test-contact-address")));

    const { addAddressToFavorites } = await test.step("act: add the address to favorites", () =>
      customer.api.graphql.execute(AddAddressToFavoritesDocument, { command: { addressId } }));
    await test.step("assert: the address is a favorite", async () => {
      const { contact } = await customer.api.graphql.execute(GetContactAddressesDocument, { id: customer.contactId });
      expect(addAddressToFavorites).toBe(true);
      expect(contact?.addresses?.items?.find((item) => item?.id === addressId)?.isFavorite).toBe(true);
    });

    const { removeAddressFromFavorites } = await test.step("act: remove the address from favorites", () =>
      customer.api.graphql.execute(RemoveAddressFromFavoritesDocument, { command: { addressId } }));
    await test.step("assert: the address is no longer a favorite", async () => {
      const { contact } = await customer.api.graphql.execute(GetContactAddressesDocument, { id: customer.contactId });
      expect(removeAddressFromFavorites).toBe(true);
      expect(contact?.addresses?.items?.find((item) => item?.id === addressId)?.isFavorite).toBe(false);
    });
  });
});
