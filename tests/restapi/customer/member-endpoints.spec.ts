import * as allure from "allure-js-commons";

import { newContact, newCustomerAddress, newEmployee, newOrganization, newVendor } from "@dataset/builders/customer";
import { expect, test } from "@fixtures";

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Customer / Members");
});

test.describe("member endpoints (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("add an address to a contact", async ({ api, arrange }) => {
    await allure.story("Addresses");
    await allure.description("An address saved for a contact is the contact's only address.");
    const contact = await test.step("arrange: a contact", () => arrange.customers.member(newContact()));
    const address = newCustomerAddress();

    await test.step("act: save the contact's address", () => api.rest.customers.updateAddresses(contact.id, [address]));

    await test.step("assert: the contact has the address", async () => {
      expect((await api.rest.customers.contacts.get(contact.id)).addresses).toEqual([
        expect.objectContaining({ line1: address.line1, city: address.city, countryCode: address.countryCode }),
      ]);
    });
  });

  test("list the organizations of a member", async ({ api, arrange }) => {
    await allure.story("Organizations");
    await allure.description("A contact's organizations are exactly the ones it belongs to.");
    const organizationId = await test.step("arrange: an organization", () => arrange.customers.organization());
    const contact = await test.step("arrange: a contact in the organization", () =>
      arrange.customers.member(newContact(organizationId)));

    const organizations = await test.step("act: list the contact's organizations", () =>
      api.rest.customers.listOrganizationsOf(contact.id));

    await test.step("assert: the contact belongs to exactly that organization", () => {
      expect(organizations.map(({ id }) => id)).toEqual([organizationId]);
    });
  });

  test("list every organization", async ({ api, arrange }) => {
    await allure.story("Organizations");
    await allure.description("The list of every organization includes a new one.");
    const organization = await test.step("arrange: an organization", () => arrange.customers.member(newOrganization()));

    const organizations = await test.step("act: list every organization", () => api.rest.customers.listOrganizations());

    await test.step("assert: the new organization is listed", () => {
      expect(organizations.map(({ id }) => id)).toContain(organization.id);
    });
  });

  test("delete the members matching a search", async ({ api, arrange }) => {
    await allure.story("Delete");
    await allure.description("Deleting the members that match a search removes exactly those members.");
    const ids = await test.step("arrange: two organizations", async () =>
      (await arrange.customers.members([newOrganization(), newOrganization()])).map(({ id }) => id));

    await test.step("act: delete the members matching their ids", () =>
      api.rest.customers.deleteMatchingMembers({ objectIds: ids }));

    await test.step("assert: neither member is found", async () => {
      expect(await api.rest.customers.members.search({ objectIds: ids })).toEqual([]);
    });
  });

  test("get employees by ids through the employees endpoint", async ({ api, arrange }) => {
    await allure.story("Read");
    await allure.description("The employees endpoint returns employees by their ids.");
    const employees = await test.step("arrange: two employees", () =>
      arrange.customers.members([newEmployee(), newEmployee()]));
    const ids = employees.map(({ id }) => id);

    const found = await test.step("act: get the employees by their ids", () =>
      api.rest.customers.employees.getMany(ids));

    await test.step("assert: both employees are returned", () => {
      expect(found.map(({ id }) => id).toSorted()).toEqual(ids.toSorted());
    });
  });

  test("search vendors through the vendors endpoint", async ({ api, arrange }) => {
    await allure.story("Search");
    await allure.description("The vendors endpoint finds a vendor by its id, as a vendor.");
    const vendor = await test.step("arrange: a vendor", () => arrange.customers.member(newVendor()));

    const found = await test.step("act: search vendors by the vendor's id", () =>
      api.rest.customers.vendors.search({ objectIds: [vendor.id] }));

    await test.step("assert: exactly the vendor is found", () => {
      expect(found).toEqual([expect.objectContaining({ id: vendor.id, memberType: "Vendor" })]);
    });
  });
});
