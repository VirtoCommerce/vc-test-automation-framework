import { ORGANIZATION_MAINTAINER } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { GetOrganizationContactsDocument } from "@graphql/generated/graphql.ts";
import { requireDefined } from "@support/require-fields.ts";

const ORGANIZATION_ID = "organization-acme-store";
const CONTACT_ID = "contact-acme-store-employee-1";
const STATUSES = ["Approved", "Invited", "Locked"] as const;
const CONTACTS_PAGE_SIZE = 100;

test.describe("organization contact search (organization maintainer)", () => {
  test.use({ shopperAs: ORGANIZATION_MAINTAINER });

  test("find a contact by full name", async ({ shopper, dataset }) => {
    const contact = dataset.contacts.get(CONTACT_ID);
    const fullName = `${contact.firstName} ${contact.lastName}`;

    const { organization } = await test.step(`act: search "${fullName}"`, () =>
      shopper.graphql.execute(GetOrganizationContactsDocument, {
        organizationId: ORGANIZATION_ID,
        searchPhrase: fullName,
        first: CONTACTS_PAGE_SIZE,
      }));

    await test.step("assert: the contact is found by its name", () => {
      const found = requireDefined(organization?.contacts?.items, "Contact").find(({ id }) => id === CONTACT_ID);
      expect(found?.fullName).toContain(fullName);
    });
  });

  test("find a contact by email", async ({ shopper, dataset }) => {
    const [email] = requireDefined(dataset.contacts.get(CONTACT_ID).emails, "Contact e-mail");

    const { organization } = await test.step(`act: search "${email}"`, () =>
      shopper.graphql.execute(GetOrganizationContactsDocument, {
        organizationId: ORGANIZATION_ID,
        searchPhrase: email,
        first: CONTACTS_PAGE_SIZE,
      }));

    await test.step("assert: the contact with that account e-mail is found", () => {
      const found = requireDefined(organization?.contacts?.items, "Contact").find(({ id }) => id === CONTACT_ID);
      expect(found?.securityAccounts?.map((account) => account?.userName)).toContain(email);
    });
  });

  for (const roleId of [
    "role-org-maintainer",
    "role-org-employee",
    "role-purchasing-agent",
    "role-store-admin",
    "role-store-manager",
  ]) {
    test(`filter contacts by role ${roleId}`, async ({ shopper, dataset }) => {
      const contactsWithRole = new Set(
        dataset.users
          .filter((user) => user.roles?.some((role) => role.id === roleId) === true)
          .map((user) => user.memberId),
      );
      const expected = dataset.contacts
        .filter(
          (contact) => contact.organizations?.includes(ORGANIZATION_ID) === true && contactsWithRole.has(contact.id),
        )
        .map(({ id }) => id);

      const { organization } = await test.step(`act: filter by role ${roleId}`, () =>
        shopper.graphql.execute(GetOrganizationContactsDocument, {
          organizationId: ORGANIZATION_ID,
          searchPhrase: `'roleId':'${roleId}'`,
          first: CONTACTS_PAGE_SIZE,
        }));

      await test.step(`assert: exactly the dataset's contacts with the ${roleId} role are found`, () => {
        expect(expected.length).toBeGreaterThan(0);
        expect(
          requireDefined(organization?.contacts?.items, "Contact")
            .map(({ id }) => id)
            .toSorted(),
        ).toEqual(expected.toSorted());
      });
    });
  }

  for (const status of STATUSES) {
    test(`filter contacts by status ${status}`, async ({ shopper, dataset }) => {
      const expected = dataset.contacts
        .filter((contact) => contact.organizations?.includes(ORGANIZATION_ID) === true && contact.status === status)
        .map(({ id }) => id);

      const { organization } = await test.step(`act: filter by status ${status}`, () =>
        shopper.graphql.execute(GetOrganizationContactsDocument, {
          organizationId: ORGANIZATION_ID,
          searchPhrase: `'status':'${status}'`,
          first: CONTACTS_PAGE_SIZE,
        }));

      await test.step(`assert: exactly the dataset's ${status} contacts are found`, () => {
        expect(expected.length).toBeGreaterThan(0);
        expect(
          requireDefined(organization?.contacts?.items, "Contact")
            .map(({ id }) => id)
            .toSorted(),
        ).toEqual(expected.toSorted());
      });
    });
  }
});
