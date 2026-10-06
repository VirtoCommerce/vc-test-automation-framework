import type { GraphqlClient } from "@api/graphql/graphql-client";
import type { ContactData } from "@api/rest/types/customers";
import type { Dataset } from "@dataset/dataset";
import type { FrontendContext } from "@dataset/frontend-context";

import * as allure from "allure-js-commons";

import { GetOrganizationContactsDocument } from "@api/graphql/generated/graphql";
import { requireFields, requireItems } from "@core/required-fields";
import { SEEDED_USERS } from "@dataset/seeded";
import { expect, seededUser, test } from "@fixtures";

const MAINTAINER_USERNAME = SEEDED_USERS.storeMaintainer;
const CONTACT_ID = "contact-acme-store-employee-1";
const CONTACT_FULL_NAME = "ACME Employee A";
const CONTACT_EMAIL = SEEDED_USERS.storeEmployee;
const ROLE_IDS = ["org-maintainer", "org-employee", "purchasing-agent", "store-admin", "store-manager"] as const;
const STATUSES = ["Approved", "Invited", "Locked"] as const;
const CONTACTS_PAGE_SIZE = 100;

test.beforeEach(async () => {
  await allure.feature("Contacts / Search");
});

test.describe("organization contact search (seeded maintainer)", () => {
  test.use({ user: seededUser(MAINTAINER_USERNAME) });

  test("find a contact by full name", async ({ graphqlClient, frontendContext }) => {
    const contacts = await test.step(`act: search "${CONTACT_FULL_NAME}"`, () =>
      searchContacts(graphqlClient, organizationOf(frontendContext), CONTACT_FULL_NAME));

    await test.step("assert: the contact is found by name", async () => {
      expect(contacts.find(({ id }) => id === CONTACT_ID)?.fullName).toContain(CONTACT_FULL_NAME);
    });
  });

  test("find a contact by email", async ({ graphqlClient, frontendContext }) => {
    const contacts = await test.step(`act: search "${CONTACT_EMAIL}"`, () =>
      searchContacts(graphqlClient, organizationOf(frontendContext), CONTACT_EMAIL));

    await test.step("assert: the contact with that account email is found", async () => {
      const contact = contacts.find(({ id }) => id === CONTACT_ID);
      expect(contact?.securityAccounts?.map((account) => account?.userName)).toContain(CONTACT_EMAIL);
    });
  });

  for (const roleId of ROLE_IDS) {
    test(`filter contacts by role ${roleId}`, async ({ graphqlClient, frontendContext, dataset }) => {
      const contacts = await test.step(`act: filter by role ${roleId}`, () =>
        searchContacts(graphqlClient, organizationOf(frontendContext), `'roleId':'${roleId}'`));

      await test.step(`assert: exactly the seeded contacts with the ${roleId} role are found`, async () => {
        const withRole = new Set(
          dataset.users
            .filter(({ roles }) => roles?.some((role) => role.id === roleId))
            .map(({ memberId }) => memberId),
        );
        expect(idsOf(contacts)).toEqual(
          seededContactIds(dataset, organizationOf(frontendContext), ({ id }) => withRole.has(id)),
        );
      });
    });
  }

  for (const status of STATUSES) {
    test(`filter contacts by status ${status}`, async ({ graphqlClient, frontendContext, dataset }) => {
      const contacts = await test.step(`act: filter by status ${status}`, () =>
        searchContacts(graphqlClient, organizationOf(frontendContext), `'status':'${status}'`));

      await test.step(`assert: exactly the seeded ${status} contacts are found`, async () => {
        expect(idsOf(contacts)).toEqual(
          seededContactIds(dataset, organizationOf(frontendContext), (contact) => contact.status === status),
        );
      });
    });
  }
});

function seededContactIds(
  dataset: Dataset,
  organizationId: string,
  matches: (contact: ContactData) => boolean,
): string[] {
  const ids = dataset.contacts
    .filter((contact) => contact.organizations?.includes(organizationId) && matches(contact))
    .map((contact) => requireFields(contact, ["id"], "Seeded contact").id);
  expect(ids, "the seed has contacts for this filter").not.toEqual([]);
  return ids.sort();
}

function idsOf(contacts: readonly { readonly id: string }[]): string[] {
  return contacts.map(({ id }) => id).sort();
}

function organizationOf(context: FrontendContext): string {
  return requireFields(context, ["organizationId"], `Organization of ${context.userName}`).organizationId;
}

async function searchContacts(graphqlClient: GraphqlClient, organizationId: string, searchPhrase: string) {
  const { organization } = await graphqlClient.execute(GetOrganizationContactsDocument, {
    organizationId,
    searchPhrase,
    first: CONTACTS_PAGE_SIZE,
  });
  return requireItems(organization?.contacts?.items, `Contacts of ${organizationId}`);
}
