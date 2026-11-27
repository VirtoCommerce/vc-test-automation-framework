import type {
  VirtoCommerceCustomerModuleCoreModelContact as Contact,
  VirtoCommerceCustomerModuleCoreModelMember as Member,
  VirtoCommerceCustomerModuleCoreModelSearchMemberSearchResult as MemberSearchResult,
} from "@rest/generated/platform.ts";

import { newContact, newCustomerAddress, newEmployee, newOrganization, newVendor } from "@builders/customer.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";

test.describe("member endpoints (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("add an address to a contact", async ({ api, arrange }) => {
    const contact = await test.step("arrange: a contact", () => arrange.customers.member(newContact()));
    const address = newCustomerAddress();

    await test.step("act: save the contact's address", async () =>
      (await api.put("/api/addresses", { query: { memberId: contact.id }, json: [address] })).expectOk());

    await test.step("assert: the contact has the address", async () => {
      const reloaded = (await api.get(`/api/contacts/${contact.id}`)).expectOk().json<Contact>();
      expect(reloaded.addresses).toEqual([
        expect.objectContaining({ line1: address.line1, city: address.city, countryCode: address.countryCode }),
      ]);
    });
  });

  test("list the organizations of a member", async ({ api, arrange }) => {
    const organizationId = await test.step("arrange: an organization", () => arrange.customers.organization());
    const contact = await test.step("arrange: a contact in the organization", () =>
      arrange.customers.member(newContact(organizationId)));

    const organizations = await test.step("act: list the contact's organizations", async () =>
      (await api.get(`/api/members/${contact.id}/organizations`)).expectOk().json<Member[]>());

    await test.step("assert: the contact belongs to exactly that organization", () => {
      expect(organizations.map(({ id }) => id)).toEqual([organizationId]);
    });
  });

  test("list every organization", async ({ api, arrange }) => {
    const organization = await test.step("arrange: an organization", () => arrange.customers.member(newOrganization()));

    const organizations = await test.step("act: list every organization", async () =>
      (await api.get("/api/members/organizations")).expectOk().json<Member[]>());

    await test.step("assert: the new organization is listed", () => {
      expect(organizations.map(({ id }) => id)).toContain(organization.id);
    });
  });

  test("delete the members matching a search", async ({ api, arrange }) => {
    const ids = await test.step("arrange: two organizations", async () =>
      (await arrange.customers.members([newOrganization(), newOrganization()])).map(({ id }) => id));

    await test.step("act: delete the members matching their ids", async () =>
      (await api.post("/api/members/delete", { json: { objectIds: ids } })).expectOk());

    await test.step("assert: neither member is found", async () => {
      const found = (await api.post("/api/members/search", { json: { objectIds: ids } }))
        .expectOk()
        .json<MemberSearchResult>();
      expect(found.results ?? []).toEqual([]);
    });
  });

  test("get employees by ids through the employees endpoint", async ({ api, arrange }) => {
    const employees = await test.step("arrange: two employees", () =>
      arrange.customers.members([newEmployee(), newEmployee()]));
    const ids = employees.map(({ id }) => id);

    const found = await test.step("act: get the employees by their ids", async () =>
      (await api.get("/api/employees", { query: { ids } })).expectOk().json<Member[]>());

    await test.step("assert: both employees are returned", () => {
      expect(found.map(({ id }) => id).toSorted()).toEqual(ids.toSorted());
    });
  });

  test("search vendors through the vendors endpoint", async ({ api, arrange }) => {
    const vendor = await test.step("arrange: a vendor", () => arrange.customers.member(newVendor()));

    const found = await test.step("act: search vendors by the vendor's id", async () =>
      (await api.post("/api/vendors/search", { json: { objectIds: [vendor.id] } }))
        .expectOk()
        .json<MemberSearchResult>());

    await test.step("assert: exactly the vendor is found", () => {
      expect(found.results).toEqual([expect.objectContaining({ id: vendor.id, memberType: "Vendor" })]);
    });
  });
});
