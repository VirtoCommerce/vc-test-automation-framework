import type { MemberDraft } from "@builders/customer.ts";
import type {
  VirtoCommerceCustomerModuleCoreModelMember as Member,
  VirtoCommerceCustomerModuleCoreModelSearchMemberSearchResult as MemberSearchResult,
} from "@rest/generated/platform.ts";
import type { HttpClient, HttpResponse } from "@virtocommerce/test-automation-framework/http";

import { randomUUID } from "node:crypto";

import { newContact, newEmployee, newOrganization, newVendor } from "@builders/customer.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { uniqueId } from "@support/unique-id.ts";

type NamedMember = Member & { readonly firstName?: string | null };

const MEMBER_TYPES: readonly {
  readonly memberType: string;
  readonly endpoint: string;
  readonly draft: () => MemberDraft;
  readonly renamedField: "name" | "firstName";
}[] = [
  { memberType: "Contact", endpoint: "contacts", draft: () => newContact(), renamedField: "firstName" },
  { memberType: "Organization", endpoint: "organizations", draft: () => newOrganization(), renamedField: "name" },
  { memberType: "Employee", endpoint: "members", draft: newEmployee, renamedField: "name" },
  { memberType: "Vendor", endpoint: "members", draft: newVendor, renamedField: "name" },
];

for (const { memberType, endpoint, draft, renamedField } of MEMBER_TYPES) {
  const path = `/api/${endpoint}`;

  test.describe(`${memberType} members through the ${endpoint} endpoint (store administrator)`, () => {
    test.use({ user: STORE_ADMINISTRATOR });

    test(`create a ${memberType}`, async ({ api, arrange }) => {
      const member = draft();
      arrange.customers.deleteMembersLater([member.id]);

      const created = await test.step(`act: create a ${memberType}`, async () =>
        (await api.post(path, { json: member })).expectOk().json<Member>());

      await test.step(`assert: the ${memberType} has its type and name`, () => {
        expect(created).toMatchObject({ id: member.id, memberType, name: member.name });
      });
    });

    test(`create ${memberType} members in bulk`, async ({ api, arrange }) => {
      const members = [draft(), draft()];
      const ids = members.map(({ id }) => id);
      arrange.customers.deleteMembersLater(ids);

      await test.step(`act: create two ${memberType} members in one request`, async () =>
        (await api.post(`${path}/bulk`, { json: members })).expectOk());

      await test.step("assert: both members exist with their names", async () => {
        expect((await membersOf(api, path, ids)).map(({ name }) => name).toSorted()).toEqual(
          members.map(({ name }) => name).toSorted(),
        );
      });
    });

    test(`get a ${memberType} by id`, async ({ api, arrange }) => {
      const member = await test.step(`arrange: a ${memberType}`, () => arrange.customers.member(draft()));

      const reloaded = await test.step(`act: get the ${memberType}`, async () =>
        (await api.get(`${path}/${member.id}`)).expectOk().json<Member>());

      await test.step("assert: the fields match the created member", () => {
        expect(reloaded).toMatchObject({ id: member.id, name: member.name, memberType });
      });
    });

    test(`get a missing ${memberType}`, async ({ api }) => {
      const response = await test.step(`act: look a ${memberType} up by an unknown id`, () =>
        api.get(`${path}/${randomUUID()}`));

      await test.step("assert: nothing is found", () => {
        expect(optionalMember(response)).toBeUndefined();
      });
    });

    test(`search ${memberType} members by id`, async ({ api, arrange }) => {
      const member = await test.step(`arrange: a ${memberType}`, () => arrange.customers.member(draft()));

      const found = await test.step(`act: search by the ${memberType}'s id`, () =>
        searchMembers(api, path, { objectIds: [member.id], deepSearch: true }));

      await test.step(`assert: exactly the ${memberType} is found`, () => {
        expect(found.map(({ id }) => id)).toEqual([member.id]);
      });
    });

    test(`rename a ${memberType}`, async ({ api, arrange }) => {
      const member = await test.step(`arrange: a ${memberType}`, () => arrange.customers.member(draft()));
      const newName = uniqueId("Renamed");

      await test.step(`act: change the ${memberType}'s ${renamedField}`, async () =>
        (await api.put(path, { json: { ...member, [renamedField]: newName } })).expectOk());

      await test.step(`assert: the ${memberType} has the new ${renamedField}`, async () => {
        const reloaded = (await api.get(`${path}/${member.id}`)).expectOk().json<NamedMember>();
        expect(reloaded[renamedField]).toBe(newName);
      });
    });

    test(`rename ${memberType} members in bulk`, async ({ api, arrange }) => {
      const members = await test.step(`arrange: two ${memberType} members`, () =>
        arrange.customers.members([draft(), draft()]));
      const newNames = [uniqueId("Renamed"), uniqueId("Renamed")];

      await test.step(`act: change the ${renamedField} of both members in one request`, async () =>
        (
          await api.put(`${path}/bulk`, {
            json: members.map((member, index) => ({ ...member, [renamedField]: newNames[index] })),
          })
        ).expectOk());

      await test.step(`assert: both members have their new ${renamedField}`, async () => {
        const reloaded = await membersOf(
          api,
          path,
          members.map(({ id }) => id),
        );
        expect(reloaded.map((member) => member[renamedField]).toSorted()).toEqual(newNames.toSorted());
      });
    });

    test(`delete ${memberType} members in bulk`, async ({ api, arrange }) => {
      const ids = await test.step(`arrange: two ${memberType} members`, async () =>
        (await arrange.customers.members([draft(), draft()])).map(({ id }) => id));

      await test.step("act: delete both members in one request", async () =>
        (await api.delete(path, { query: { ids } })).expectOk());

      await test.step("assert: neither member is read or found", async () => {
        const read = await Promise.all(ids.map(async (id) => optionalMember(await api.get(`${path}/${id}`))));
        expect(read).toEqual([undefined, undefined]);
        expect(await searchMembers(api, path, { objectIds: ids })).toEqual([]);
      });
    });
  });
}

async function membersOf(api: HttpClient, path: string, ids: readonly string[]): Promise<NamedMember[]> {
  return (await api.get(path, { query: { ids: [...ids] } })).expectOk().json<NamedMember[]>();
}

async function searchMembers(api: HttpClient, path: string, criteria: object): Promise<Member[]> {
  return (await api.post(`${path}/search`, { json: criteria })).expectOk().json<MemberSearchResult>().results ?? [];
}

function optionalMember(response: HttpResponse): Member | undefined {
  return response.optionalJson<Member>();
}
