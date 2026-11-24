import { ORGANIZATION_MAINTAINER } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { PageContextDocument, PageContextWhiteLabelingDocument } from "@graphql/generated/graphql.ts";
import { MODULES } from "@modules";
import { requireFields } from "@support/require-fields.ts";

const LOGO_URL = "https://example.com/test-logo.png";

test.describe("page context (anonymous)", () => {
  test("describe the requested store", async ({ shopper, store }) => {
    const { languages, currencies } = requireFields(store, ["languages", "currencies"], `Store ${store.id}`);
    const { storeId, userId, cultureName, currencyCode } = shopper.storeContext;

    const { pageContext } = await test.step("act: get the page context", () =>
      shopper.graphql.execute(PageContextDocument, { storeId, userId, cultureName }));

    await test.step("assert: the store, its defaults, languages and currencies match the dataset", () => {
      expect(pageContext?.store).toMatchObject({
        storeId,
        catalogId: store.catalog,
        defaultLanguage: { cultureName },
        defaultCurrency: { code: currencyCode },
      });
      expect(pageContext?.store?.availableLanguages?.map((language) => language?.cultureName).toSorted()).toEqual(
        languages.toSorted(),
      );
      expect(pageContext?.store?.availableCurrencies?.map((currency) => currency?.code).toSorted()).toEqual(
        currencies.toSorted(),
      );
    });
  });
});

for (const { who, shopperAs, expectedUserName } of [
  { who: "anonymous", shopperAs: "anonymous", expectedUserName: "Anonymous" },
  { who: "signed-in customer", shopperAs: ORGANIZATION_MAINTAINER, expectedUserName: ORGANIZATION_MAINTAINER.username },
] as const) {
  test.describe(`page context (${who})`, () => {
    test.use({ shopperAs });

    test("report the user who asks", async ({ shopper }) => {
      const { storeId, userId, cultureName } = shopper.storeContext;

      const { pageContext } = await test.step("act: get the page context", () =>
        shopper.graphql.execute(PageContextDocument, { storeId, userId, cultureName }));

      await test.step(`assert: the user is ${expectedUserName}`, () => {
        expect(pageContext?.user?.userName).toBe(expectedUserName);
      });
    });
  });
}

test.describe("page context with white labeling (customer of their own)", () => {
  test.use({ modules: { whiteLabeling: MODULES.whiteLabeling } });

  test("return the white-labeling settings of the organization", {
    annotation: {
      type: "leaves data",
      description: "The platform cannot delete white-labeling settings; cleanup turns the setting off.",
    },
  }, async ({ arrange }) => {
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customer());
    const [footer, mainMenu] = await test.step("arrange: a footer and a main menu link list", async () => [
      await arrange.content.menuLinkList(),
      await arrange.content.menuLinkList(),
    ]);
    await test.step("arrange: white labeling of the customer's organization", () =>
      arrange.platform.whiteLabeling({
        organizationId: customer.organizationId,
        logoUrl: LOGO_URL,
        footerLinkListName: footer.name,
        mainMenuLinkListName: mainMenu.name,
      }));
    const { storeId, userId, cultureName } = customer.storeContext;

    const { pageContext } = await test.step("act: get the customer's page context", () =>
      customer.graphql.execute(PageContextWhiteLabelingDocument, {
        storeId,
        userId,
        cultureName,
        organizationId: customer.organizationId,
      }));

    await test.step("assert: the logo and both menus come from the organization's settings", () => {
      expect(pageContext?.whiteLabelingSettings).toMatchObject({
        logoUrl: LOGO_URL,
        footerLinks: footer.menuLinks.map(({ title, url }) => expect.objectContaining({ title, url })),
        mainMenuLinks: mainMenu.menuLinks.map(({ title, url }) => expect.objectContaining({ title, url })),
      });
    });
  });
});
