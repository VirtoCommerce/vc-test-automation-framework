import type { VirtoCommerceCustomerModuleCoreModelContact as Contact } from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { newPassword } from "@builders/security.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { RequestRegistrationDocument } from "@graphql/generated/graphql.ts";
import { requireFields } from "@support/require-fields.ts";
import { uniqueId } from "@support/unique-id.ts";

const APPROVED = "Approved";
const REGISTRATION_TIMEOUT_MS = 30_000;

test.describe("registration (anonymous visitor)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("register a personal contact", async ({ api, shopper, arrange, store }) => {
    const email = `${uniqueId("test-register-personal")}@example.com`;
    arrange.customers.deleteAccountLater(email);
    const { cultureName } = shopper.storeContext;

    const { requestRegistration } = await test.step(`act: register ${email}`, () =>
      shopper.graphql.execute(RequestRegistrationDocument, {
        command: {
          storeId: store.id,
          languageCode: cultureName,
          contact: { firstName: "John", lastName: "Doe" },
          account: { username: email, email, password: newPassword().reveal() },
        },
      }));
    const contact = requireFields(requestRegistration?.contact, ["id"], "Registered contact");

    await test.step("assert: the registration succeeded without an organization", () => {
      expect(requestRegistration).toMatchObject({
        result: { succeeded: true },
        organization: null,
        contact: { firstName: "John", lastName: "Doe" },
        account: { email },
      });
    });
    await test.step("assert: the contact is approved and belongs to no organization", async () => {
      await expect
        .poll(async () => (await contactOf(api, contact.id))?.status, {
          timeout: REGISTRATION_TIMEOUT_MS,
        })
        .toBe(APPROVED);
      expect((await contactOf(api, contact.id))?.organizations).toEqual([]);
    });
  });

  test("register a contact with a new organization", async ({ api, shopper, arrange, store }) => {
    const email = `${uniqueId("test-register-organization")}@example.com`;
    const organizationName = uniqueId("test-registered-organization");
    arrange.customers.deleteAccountLater(email);
    const { cultureName } = shopper.storeContext;

    const { requestRegistration } = await test.step(`act: register ${email} with ${organizationName}`, () =>
      shopper.graphql.execute(RequestRegistrationDocument, {
        command: {
          storeId: store.id,
          languageCode: cultureName,
          contact: { firstName: "Jane", lastName: "Smith" },
          account: { username: email, email, password: newPassword().reveal() },
          organization: { name: organizationName },
        },
      }));
    const contact = requireFields(requestRegistration?.contact, ["id"], "Registered contact");
    const organization = requireFields(requestRegistration?.organization, ["id"], "Registered organization");
    arrange.customers.deleteOrganizationLater(organization.id);

    await test.step("assert: the registration succeeded with the organization", () => {
      expect(requestRegistration).toMatchObject({
        result: { succeeded: true },
        organization: { name: organizationName },
        contact: { firstName: "Jane", lastName: "Smith" },
        account: { email },
      });
    });
    await test.step("assert: the approved contact belongs to the organization", async () => {
      await expect
        .poll(async () => (await contactOf(api, contact.id))?.organizations, {
          timeout: REGISTRATION_TIMEOUT_MS,
        })
        .toContain(organization.id);
      expect((await contactOf(api, contact.id))?.status).toBe(APPROVED);
    });
  });
});

async function contactOf(api: HttpClient, id: string): Promise<Contact | undefined> {
  return (await api.get(`/api/contacts/${id}`)).optionalJson<Contact>();
}
