import { expect, test } from "@fixtures";
import { GetOrganizationsDocument } from "@graphql/generated/graphql.ts";
import { MODULES } from "@modules";
import { uniqueId } from "@support/unique-id.ts";

const ORGANIZATIONS_PAGE_SIZE = 100;
const SPECIAL_CHARACTER_TERMS = [
  { term: "[e2e]", description: "literal brackets" },
  { term: "(parentheses)", description: "parentheses" },
  { term: "Company &", description: "an ampersand" },
  { term: "Test* Des", description: "an asterisk" },
] as const;

test.describe("organization search (customer of their own)", () => {
  test.use({ modules: { xProfile: MODULES.xProfile } });

  for (const { term, description } of SPECIAL_CHARACTER_TERMS) {
    test(`search organizations by a term with ${description}`, async ({ arrange }) => {
      const name = `${term} ${uniqueId("test-organization")}`;
      const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customer());
      await test.step(`arrange: the customer's searchable membership in ${name}`, () =>
        arrange.customers.searchableMemberships(customer, [name]));

      const { me } = await test.step(`act: search "${term}"`, () =>
        customer.graphql.execute(GetOrganizationsDocument, {
          searchPhrase: term,
          first: ORGANIZATIONS_PAGE_SIZE,
        }));

      await test.step(`assert: ${name} is found`, () => {
        expect(me?.contact?.organizations?.items?.map((item) => item?.name)).toContain(name);
      });
    });
  }
});
