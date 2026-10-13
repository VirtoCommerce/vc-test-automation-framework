import type { MemberResource } from "@api/rest/clients/customers-client";
import type { RestApi } from "@api/rest/rest-api";
import type { MemberData } from "@api/rest/types/customers";

import { randomUUID } from "node:crypto";

import * as allure from "allure-js-commons";

import { uniqueId } from "@core/unique-id";
import { newContact, newEmployee, newOrganization, newVendor } from "@dataset/builders/customer";
import { expect, test } from "@fixtures";

type NamedMember = MemberData & { firstName?: string | null };

interface MemberTypeCase {
  readonly memberType: string;
  readonly endpoint: string;
  readonly draft: () => NamedMember & { readonly id: string; readonly name: string };
  readonly resource: (rest: RestApi) => MemberResource<NamedMember>;
  readonly renamedField: "name" | "firstName";
}

const MEMBER_TYPES: readonly MemberTypeCase[] = [
  {
    memberType: "Contact",
    endpoint: "contacts",
    draft: () => newContact(),
    resource: (rest) => rest.customers.contacts,
    renamedField: "firstName",
  },
  {
    memberType: "Organization",
    endpoint: "organizations",
    draft: () => newOrganization(),
    resource: (rest) => rest.customers.organizations,
    renamedField: "name",
  },
  {
    memberType: "Employee",
    endpoint: "members",
    draft: newEmployee,
    resource: (rest) => rest.customers.members,
    renamedField: "name",
  },
  {
    memberType: "Vendor",
    endpoint: "members",
    draft: newVendor,
    resource: (rest) => rest.customers.members,
    renamedField: "name",
  },
];

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Customer / Members");
});

for (const { memberType, endpoint, draft, resource, renamedField } of MEMBER_TYPES) {
  test.describe(`${memberType} members through the ${endpoint} endpoint (store administrator)`, () => {
    test.use({ user: "acme_store_administrator@acme.com" });

    test(`create a ${memberType}`, async ({ api, cleanup }) => {
      await allure.story("Create");
      await allure.description(`A new ${memberType} has its member type and name.`);
      const member = draft();
      cleanup.push(`delete ${memberType} ${member.name}`, () => resource(api.rest).delete([member.id]));

      const created = await test.step(`act: create a ${memberType}`, () => resource(api.rest).create(member));

      await test.step(`assert: the ${memberType} has its type and name`, () => {
        expect(created).toMatchObject({ id: member.id, memberType, name: member.name });
      });
    });

    test(`create ${memberType} members in bulk`, async ({ api, cleanup }) => {
      await allure.story("Create");
      await allure.description(`Two ${memberType} members created in one request both exist.`);
      const members = [draft(), draft()];
      const ids = members.map(({ id }) => id);
      cleanup.push(`delete ${memberType} members ${ids.join(", ")}`, () => resource(api.rest).delete(ids));

      await test.step(`act: create two ${memberType} members in one request`, () =>
        resource(api.rest).createMany(members));

      await test.step("assert: both members exist with their names", async () => {
        expect((await resource(api.rest).getMany(ids)).map(({ name }) => name).toSorted()).toEqual(
          members.map(({ name }) => name).toSorted(),
        );
      });
    });

    test(`get a ${memberType} by id`, async ({ api, arrange }) => {
      await allure.story("Read");
      await allure.description(`A ${memberType} is read back by its id with the name it was created with.`);
      const member = await test.step(`arrange: a ${memberType}`, () => arrange.customers.member(draft()));

      const reloaded = await test.step(`act: get the ${memberType}`, () => resource(api.rest).get(member.id));

      await test.step("assert: the fields match the created member", () => {
        expect(reloaded).toMatchObject({ id: member.id, name: member.name, memberType });
      });
    });

    test(`get a missing ${memberType}`, async ({ api }) => {
      await allure.story("Read");
      await allure.description(`Looking a ${memberType} up by an id that does not exist finds nothing.`);

      const found = await test.step(`act: look a ${memberType} up by an unknown id`, () =>
        resource(api.rest).find(randomUUID()));

      await test.step("assert: nothing is found", () => {
        expect(found).toBeUndefined();
      });
    });

    test(`search ${memberType} members by id`, async ({ api, arrange }) => {
      await allure.story("Search");
      await allure.description(`Searching by a ${memberType}'s id finds exactly that member.`);
      const member = await test.step(`arrange: a ${memberType}`, () => arrange.customers.member(draft()));

      const found = await test.step(`act: search by the ${memberType}'s id`, () =>
        resource(api.rest).search({ objectIds: [member.id], deepSearch: true }));

      await test.step(`assert: exactly the ${memberType} is found`, () => {
        expect(found.map(({ id }) => id)).toEqual([member.id]);
      });
    });

    test(`rename a ${memberType}`, async ({ api, arrange }) => {
      await allure.story("Update");
      await allure.description(`A ${memberType} renamed through its ${renamedField} is read back with the new value.`);
      const member = await test.step(`arrange: a ${memberType}`, () => arrange.customers.member(draft()));
      const newName = uniqueId("Renamed");

      await test.step(`act: change the ${memberType}'s ${renamedField}`, () =>
        resource(api.rest).update({ ...member, [renamedField]: newName }));

      await test.step(`assert: the ${memberType} has the new ${renamedField}`, async () => {
        expect((await resource(api.rest).get(member.id))[renamedField]).toBe(newName);
      });
    });

    test(`rename ${memberType} members in bulk`, async ({ api, arrange }) => {
      await allure.story("Update");
      await allure.description(`Two ${memberType} members renamed in one request both have their new ${renamedField}.`);
      const members = await test.step(`arrange: two ${memberType} members`, () =>
        arrange.customers.members([draft(), draft()]));
      const newNames = [uniqueId("Renamed"), uniqueId("Renamed")];

      await test.step(`act: change the ${renamedField} of both members in one request`, () =>
        resource(api.rest).updateMany(
          members.map((member, index) => ({ ...member, [renamedField]: newNames[index] })),
        ));

      await test.step(`assert: both members have their new ${renamedField}`, async () => {
        const reloaded = await resource(api.rest).getMany(members.map(({ id }) => id));
        expect(reloaded.map((member) => member[renamedField]).toSorted()).toEqual(newNames.toSorted());
      });
    });

    test(`delete ${memberType} members in bulk`, async ({ api, arrange }) => {
      await allure.story("Delete");
      await allure.description(
        `Two ${memberType} members deleted in one request are neither read nor found by search.`,
      );
      const ids = await test.step(`arrange: two ${memberType} members`, async () =>
        (await arrange.customers.members([draft(), draft()])).map(({ id }) => id));

      await test.step("act: delete both members in one request", () => resource(api.rest).delete(ids));

      await test.step("assert: neither member is read or found", async () => {
        expect(await Promise.all(ids.map((id) => resource(api.rest).find(id)))).toEqual([undefined, undefined]);
        expect(await resource(api.rest).search({ objectIds: ids })).toEqual([]);
      });
    });
  });
}
