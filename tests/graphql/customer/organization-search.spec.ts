import * as allure from "allure-js-commons";

import { GetOrganizationsDocument } from "@api/graphql/generated/graphql";
import { uniqueId } from "@core/unique-id";
import { MODULES } from "@dataset/modules";
import { expect, test } from "@fixtures";

const ORGANIZATIONS_PAGE_SIZE = 100;
const SPECIAL_CHARACTER_TERMS = [
  { term: "[e2e]", description: "literal brackets" },
  { term: "(parentheses)", description: "parentheses" },
  { term: "Company &", description: "an ampersand" },
  { term: "Test* Des", description: "an asterisk" },
] as const;

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Customer / Organization Search");
});

test.describe("organization search (customer of their own)", () => {
  test.use({ requiresModules: [MODULES.contactOrganizations] });

  for (const { term, description } of SPECIAL_CHARACTER_TERMS) {
    test(`search organizations by a term with ${description}`, async ({ arrange }) => {
      await allure.story("Search");
      await allure.description(
        `Searching the customer's organizations for "${term}" finds the organization whose name contains it; ` +
          "the special characters are matched literally and do not break the search.",
      );
      const name = `${term} ${uniqueId("test-organization")}`;
      const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
      await test.step(`arrange: the customer's searchable membership in ${name}`, () =>
        arrange.customers.searchableMemberships(customer, [name]));

      const { me } = await test.step(`act: search "${term}"`, () =>
        customer.api.graphql.execute(GetOrganizationsDocument, {
          searchPhrase: term,
          first: ORGANIZATIONS_PAGE_SIZE,
        }));

      await test.step(`assert: ${name} is found`, () => {
        expect(me?.contact?.organizations?.items?.map((item) => item?.name)).toContain(name);
      });
    });
  }
});
