import * as allure from "allure-js-commons";

import { PageContextDocument, PageContextWhiteLabelingDocument } from "@api/graphql/generated/graphql";
import { requireFields } from "@core/required-fields";
import { MODULES } from "@dataset/modules";
import { expect, test } from "@fixtures";

const LOGO_URL = "https://example.com/test-logo.png";

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Catalog / Page Context");
});

test.describe("page context (anonymous)", () => {
  test("describe the requested store", async ({ api, store }) => {
    await allure.story("Store");
    await allure.description("The page context describes the store with its catalog, languages and currencies.");
    const { languages, currencies } = requireFields(store, ["languages", "currencies"], `Store ${store.id}`);
    const { storeId, userId, cultureName, currencyCode } = await api.storeContext();

    const { pageContext } = await test.step("act: get the page context", () =>
      api.graphql.execute(PageContextDocument, { storeId, userId, cultureName }));

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

for (const { shopper, user, expectedUserName } of [
  { shopper: "anonymous", user: undefined, expectedUserName: "Anonymous" },
  {
    shopper: "signed-in customer",
    user: "acme_store_maintainer_1@acme.com",
    expectedUserName: "acme_store_maintainer_1@acme.com",
  },
] as const) {
  test.describe(`page context (${shopper})`, () => {
    test.use({ user });

    test("report the user who asks", async ({ api }) => {
      await allure.story("User");
      await allure.description("The page context reports the user who asks for it.");
      const { storeId, userId, cultureName } = await api.storeContext();

      const { pageContext } = await test.step("act: get the page context", () =>
        api.graphql.execute(PageContextDocument, { storeId, userId, cultureName }));

      await test.step(`assert: the user is ${expectedUserName}`, () => {
        expect(pageContext?.user?.userName).toBe(expectedUserName);
      });
    });
  });
}

test.describe("page context with white labeling (customer of their own)", () => {
  test.use({ requiresModules: [MODULES.whiteLabeling] });

  test("return the white-labeling settings of the organization", {
    annotation: {
      type: "leaves data",
      description: "The platform cannot delete white-labeling settings; cleanup turns the setting off.",
    },
  }, async ({ arrange }) => {
    await allure.story("White labeling");
    await allure.description("A customer's page context carries their organization's logo and menus.");
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
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
    const { storeId, userId, cultureName } = await customer.api.storeContext();

    const { pageContext } = await test.step("act: get the customer's page context", () =>
      customer.api.graphql.execute(PageContextWhiteLabelingDocument, {
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
