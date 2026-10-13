import * as allure from "allure-js-commons";

import { RequestRegistrationDocument } from "@api/graphql/generated/graphql";
import { requireFields } from "@core/required-fields";
import { uniqueId } from "@core/unique-id";
import { newPassword } from "@dataset/builders/security";
import { expect, test } from "@fixtures";

const APPROVED = "Approved";
const REGISTRATION_TIMEOUT_MS = 30_000;

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Customer / Registration");
});

test.describe("registration (anonymous visitor)", () => {
  test("register a personal contact", async ({ api, arrange, env }) => {
    await allure.story("Registration");
    await allure.description("A visitor registers without an organization and becomes an approved contact.");
    const email = `${uniqueId("test-register-personal")}@example.com`;
    arrange.customers.deleteAccountLater(email);
    const { cultureName } = await api.storeContext();

    const { requestRegistration } = await test.step(`act: register ${email}`, () =>
      api.graphql.execute(RequestRegistrationDocument, {
        command: {
          storeId: env.storeId,
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
        .poll(async () => (await arrange.admin.rest.customers.contacts.find(contact.id))?.status, {
          timeout: REGISTRATION_TIMEOUT_MS,
        })
        .toBe(APPROVED);
      expect((await arrange.admin.rest.customers.contacts.get(contact.id)).organizations).toEqual([]);
    });
  });

  test("register a contact with a new organization", async ({ api, arrange, env }) => {
    await allure.story("Registration");
    await allure.description("A visitor registers with a new organization and becomes its approved contact.");
    const email = `${uniqueId("test-register-organization")}@example.com`;
    const organizationName = uniqueId("test-registered-organization");
    arrange.customers.deleteAccountLater(email);
    const { cultureName } = await api.storeContext();

    const { requestRegistration } = await test.step(`act: register ${email} with ${organizationName}`, () =>
      api.graphql.execute(RequestRegistrationDocument, {
        command: {
          storeId: env.storeId,
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
        .poll(async () => (await arrange.admin.rest.customers.contacts.find(contact.id))?.organizations, {
          timeout: REGISTRATION_TIMEOUT_MS,
        })
        .toContain(organization.id);
      expect((await arrange.admin.rest.customers.contacts.get(contact.id)).status).toBe(APPROVED);
    });
  });
});
