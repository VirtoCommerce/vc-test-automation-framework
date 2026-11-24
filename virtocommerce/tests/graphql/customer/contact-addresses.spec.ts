import type { Customer } from "@fixtures";
import type { VirtoCommerceCustomerModuleCoreModelMember as Member } from "@rest/generated/platform.ts";

import { comparableAddress, memberAddressInput, newMemberAddress } from "@builders/address.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import {
  AddAddressToFavoritesDocument,
  DeleteMemberAddressesDocument,
  GetContactAddressesDocument,
  RemoveAddressFromFavoritesDocument,
  UpdateMemberAddressesDocument,
} from "@graphql/generated/graphql.ts";

const OWNERS = [
  { owner: "contact", memberOf: (customer: Customer) => customer.contactId },
  { owner: "organization", memberOf: (customer: Customer) => customer.organizationId },
] as const;

test.describe("member addresses (customer of their own)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  for (const { owner, memberOf } of OWNERS) {
    test(`add an address to the ${owner}`, async ({ arrange }) => {
      const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customer());
      const draft = newMemberAddress(`test-${owner}-address`);

      const { updateMemberAddresses } = await test.step(`act: save the address on the ${owner}`, () =>
        customer.graphql.execute(UpdateMemberAddressesDocument, {
          command: { memberId: memberOf(customer), addresses: [draft] },
        }));

      await test.step(`assert: the ${owner} has the address`, () => {
        expect(
          updateMemberAddresses?.addresses?.items?.find((address) => address?.description === draft.description),
        ).toMatchObject(comparableAddress(draft));
      });
    });

    test(`remove an address of the ${owner}`, async ({ api, arrange }) => {
      const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customer());
      const address = await test.step(`arrange: an address of the ${owner}`, () =>
        arrange.customers.memberAddress(customer, memberOf(customer), newMemberAddress(`test-${owner}-address`)));

      const { deleteMemberAddresses } = await test.step("act: delete the address", () =>
        customer.graphql.execute(DeleteMemberAddressesDocument, {
          command: { memberId: memberOf(customer), addresses: [memberAddressInput(address)] },
        }));

      await test.step(`assert: the ${owner} no longer has the address`, async () => {
        const reloaded = (await api.get(`/api/members/${memberOf(customer)}`)).expectOk().json<Member>();
        expect(deleteMemberAddresses?.addresses?.items?.map((item) => item?.id)).not.toContain(address.id);
        expect(reloaded.addresses?.map(({ description }) => description)).not.toContain(address.description);
      });
    });
  }

  test("update an organization address", async ({ arrange }) => {
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customer());
    const address = await test.step("arrange: an organization address", () =>
      arrange.customers.memberAddress(
        customer,
        customer.organizationId,
        newMemberAddress("test-organization-address"),
      ));
    const changes = { city: "Updated City", line1: `2 Updated Street ${address.description}` };

    const { updateMemberAddresses } = await test.step("act: change the city and street", () =>
      customer.graphql.execute(UpdateMemberAddressesDocument, {
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
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customer());
    const { id: addressId } = await test.step("arrange: a contact address", () =>
      arrange.customers.memberAddress(customer, customer.contactId, newMemberAddress("test-contact-address")));

    const { addAddressToFavorites } = await test.step("act: add the address to favorites", () =>
      customer.graphql.execute(AddAddressToFavoritesDocument, { command: { addressId } }));
    await test.step("assert: the address is a favorite", async () => {
      const { contact } = await customer.graphql.execute(GetContactAddressesDocument, { id: customer.contactId });
      expect(addAddressToFavorites).toBe(true);
      expect(contact?.addresses?.items?.find((item) => item?.id === addressId)?.isFavorite).toBe(true);
    });

    const { removeAddressFromFavorites } = await test.step("act: remove the address from favorites", () =>
      customer.graphql.execute(RemoveAddressFromFavoritesDocument, { command: { addressId } }));
    await test.step("assert: the address is no longer a favorite", async () => {
      const { contact } = await customer.graphql.execute(GetContactAddressesDocument, { id: customer.contactId });
      expect(removeAddressFromFavorites).toBe(true);
      expect(contact?.addresses?.items?.find((item) => item?.id === addressId)?.isFavorite).toBe(false);
    });
  });
});
