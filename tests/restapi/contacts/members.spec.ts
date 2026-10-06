import * as allure from "allure-js-commons";

import { CustomersClient } from "@api/rest/clients/customers-client";
import { newContact, newMember, newOrganization } from "@dataset/builders/customer";
import { asWorkerAdministrator, expect, test } from "@fixtures";

test.beforeEach(async () => {
  await allure.feature("Contacts / Members");
});

test.describe("members (admin)", () => {
  test.use({ user: asWorkerAdministrator });

  test("create a member", async ({ httpClient, cleanupStack }) => {
    const { members } = new CustomersClient(httpClient);
    const draft = newMember();

    const member = await test.step("act: create member", () => members.create(draft));
    cleanupStack.push(`delete member ${member.id}`, () => members.delete([member.id]));

    await test.step("assert: member has its type and name", async () => {
      expect(member).toMatchObject({ memberType: "Organization", name: draft.name });
    });
  });

  test("create members in bulk", async ({ httpClient, cleanupStack }) => {
    const { members } = new CustomersClient(httpClient);
    const drafts = [newMember(), newMember()];
    const ids = drafts.map(({ id }) => id);
    cleanupStack.push(`delete members ${ids.join(", ")}`, () => members.delete(ids));

    await test.step("act: create two members", () => members.createMany(drafts));

    await test.step("assert: both members exist", async () => {
      expect((await members.getMany(ids)).map(({ name }) => name).sort()).toEqual(
        drafts.map(({ name }) => name).sort(),
      );
    });
  });

  test("get a member by id", async ({ httpClient, cleanupStack }) => {
    const { members } = new CustomersClient(httpClient);
    const member = await test.step("arrange: member", () => members.create(newMember()));
    cleanupStack.push(`delete member ${member.id}`, () => members.delete([member.id]));

    const reloaded = await test.step("act: get member", () => members.get(member.id));

    await test.step("assert: fields match the created member", async () => {
      expect(reloaded).toMatchObject({ id: member.id, name: member.name });
    });
  });

  test("get members by ids", async ({ httpClient, cleanupStack }) => {
    const { members } = new CustomersClient(httpClient);
    const drafts = [newMember(), newMember()];
    const ids = drafts.map(({ id }) => id);
    cleanupStack.push(`delete members ${ids.join(", ")}`, () => members.delete(ids));
    await test.step("arrange: two members", () => Promise.all(drafts.map((draft) => members.create(draft))));

    const found = await test.step("act: get members by ids", () => members.getMany(ids));

    await test.step("assert: both members are returned", async () => {
      expect(found.map(({ id }) => id).sort()).toEqual([...ids].sort());
    });
  });

  test("search members by id", async ({ httpClient, cleanupStack }) => {
    const { members } = new CustomersClient(httpClient);
    const member = await test.step("arrange: member", () => members.create(newMember()));
    cleanupStack.push(`delete member ${member.id}`, () => members.delete([member.id]));

    const found = await test.step("act: search by member id", () => members.search({ objectIds: [member.id] }));

    await test.step("assert: member is found", async () => {
      expect(found.map(({ id }) => id)).toEqual([member.id]);
    });
  });

  test("rename a member", async ({ httpClient, cleanupStack }) => {
    const { members } = new CustomersClient(httpClient);
    const member = await test.step("arrange: member", () => members.create(newMember()));
    cleanupStack.push(`delete member ${member.id}`, () => members.delete([member.id]));
    const newName = `${member.name}-renamed`;

    await test.step("act: rename member", () => members.update({ ...member, name: newName }));

    await test.step("assert: member has the new name", async () => {
      expect((await members.get(member.id)).name).toBe(newName);
    });
  });

  test("rename members in bulk", async ({ httpClient, cleanupStack }) => {
    const { members } = new CustomersClient(httpClient);
    const drafts = [newMember(), newMember()];
    const ids = drafts.map(({ id }) => id);
    cleanupStack.push(`delete members ${ids.join(", ")}`, () => members.delete(ids));
    const created = await test.step("arrange: two members", () =>
      Promise.all(drafts.map((draft) => members.create(draft))));
    const renamed = created.map((member) => ({ ...member, name: `${member.name}-renamed` }));

    await test.step("act: rename both members", () => members.updateMany(renamed));

    await test.step("assert: both members have new names", async () => {
      const reloaded = await members.getMany(ids);
      expect(reloaded.map(({ name }) => name).sort()).toEqual(renamed.map(({ name }) => name).sort());
    });
  });

  test("delete a member", async ({ httpClient, cleanupStack }) => {
    const { members } = new CustomersClient(httpClient);
    const member = await test.step("arrange: member", () => members.create(newMember()));
    cleanupStack.push(`delete member ${member.id}`, () => members.delete([member.id]));

    await test.step("act: delete member", () => members.delete([member.id]));

    await test.step("assert: member is not found", async () => {
      expect(await members.find(member.id)).toBeUndefined();
      expect(await members.search({ objectIds: [member.id] })).toEqual([]);
    });
  });

  test("delete members matching a search", async ({ httpClient, cleanupStack }) => {
    const customersClient = new CustomersClient(httpClient);
    const drafts = [newMember(), newMember()];
    const ids = drafts.map(({ id }) => id);
    cleanupStack.push(`delete members ${ids.join(", ")}`, () => customersClient.members.delete(ids));
    await test.step("arrange: two members", () =>
      Promise.all(drafts.map((draft) => customersClient.members.create(draft))));

    await test.step("act: delete members matching their ids", () =>
      customersClient.deleteMatchingMembers({ objectIds: ids }));

    await test.step("assert: neither member is found", async () => {
      expect(await customersClient.members.search({ objectIds: ids })).toEqual([]);
    });
  });

  test("list the organizations of a member", async ({ httpClient, cleanupStack }) => {
    const customersClient = new CustomersClient(httpClient);
    const organization = await test.step("arrange: organization", () =>
      customersClient.organizations.create(newOrganization()));
    cleanupStack.push(`delete organization ${organization.id}`, () =>
      customersClient.organizations.delete([organization.id]),
    );
    const contact = await test.step("arrange: contact in the organization", () =>
      customersClient.contacts.create(newContact([organization.id])));
    cleanupStack.push(`delete contact ${contact.id}`, () => customersClient.contacts.delete([contact.id]));

    const organizations = await test.step("act: list the contact organizations", () =>
      customersClient.getOrganizationsOf(contact.id));

    await test.step("assert: contact belongs to the organization", async () => {
      expect(organizations).toEqual([expect.objectContaining({ id: organization.id, name: organization.name })]);
    });
  });

  test("list organizations", async ({ httpClient, cleanupStack }) => {
    const customersClient = new CustomersClient(httpClient);
    const organization = await test.step("arrange: organization", () =>
      customersClient.organizations.create(newOrganization()));
    cleanupStack.push(`delete organization ${organization.id}`, () =>
      customersClient.organizations.delete([organization.id]),
    );

    const organizations = await test.step("act: list organizations", () => customersClient.listOrganizations());

    await test.step("assert: organization is listed", async () => {
      expect(organizations.map(({ id }) => id)).toContain(organization.id);
    });
  });
});
