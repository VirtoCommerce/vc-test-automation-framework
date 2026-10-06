import type { GraphqlClient } from "@api/graphql/graphql-client";
import type { MenuLinkListDraft } from "@dataset/builders/content";
import type { FrontendContext } from "@dataset/frontend-context";

import * as allure from "allure-js-commons";

import { PageContextDocument } from "@api/graphql/generated/graphql";
import { MenuLinkListsClient } from "@api/rest/clients/menu-link-lists-client";
import { WhiteLabelingClient } from "@api/rest/clients/white-labeling-client";
import { requireFields } from "@core/required-fields";
import { arrangeWhiteLabeling } from "@dataset/arrange/white-labeling";
import { newMenuLinkList } from "@dataset/builders/content";
import { SEEDED_USERS } from "@dataset/seeded";
import { expect, seededUser, test } from "@fixtures";

const REGISTERED_USERNAME = SEEDED_USERS.storeMaintainer;
const CATEGORY_PERMALINK = "smartphones";
const ANONYMOUS_USER_NAME = "Anonymous";
const LOGO_URL = "https://example.com/test-logo.png";

test.beforeEach(async () => {
  await allure.feature("Catalog / Page Context");
});

test.describe("page context (anonymous)", () => {
  test("describe the requested store", async ({ graphqlClient, frontendContext, dataset }) => {
    const pageContext = await test.step("act: get page context", () => getPageContext(graphqlClient, frontendContext));

    await test.step("assert: store, default language and currency match the request", async () => {
      expect(pageContext?.store).toMatchObject({
        storeId: frontendContext.storeId,
        catalogId: frontendContext.catalogId,
        defaultLanguage: { cultureName: frontendContext.cultureName },
        defaultCurrency: { code: frontendContext.currencyCode },
      });
      const seededStore = requireFields(
        dataset.stores.find(({ id }) => id === frontendContext.storeId),
        ["languages", "currencies"],
        `Seeded store ${frontendContext.storeId}`,
      );
      expect(pageContext?.store?.availableLanguages?.map((language) => language?.cultureName).sort()).toEqual(
        [...seededStore.languages].sort(),
      );
      expect(pageContext?.store?.availableCurrencies?.map((currency) => currency?.code).sort()).toEqual(
        [...seededStore.currencies].sort(),
      );
    });
  });

  test("resolve a category permalink", async ({ graphqlClient, frontendContext }) => {
    const pageContext = await test.step(`act: get page context for "${CATEGORY_PERMALINK}"`, () =>
      getPageContext(graphqlClient, frontendContext, CATEGORY_PERMALINK));

    await test.step("assert: permalink resolves to the category", async () => {
      expect(pageContext?.slugInfo?.entityInfo).toMatchObject({
        objectType: "Category",
        semanticUrl: CATEGORY_PERMALINK,
      });
    });
  });

  test("report the anonymous user", async ({ graphqlClient, frontendContext }) => {
    const pageContext = await test.step("act: get page context", () => getPageContext(graphqlClient, frontendContext));

    await test.step("assert: user is anonymous", async () => {
      expect(pageContext?.user?.userName).toBe(ANONYMOUS_USER_NAME);
    });
  });
});

test.describe("page context (registered user)", () => {
  test.use({ user: seededUser(REGISTERED_USERNAME) });

  test("resolve a category permalink for a registered user", async ({ graphqlClient, frontendContext }) => {
    const pageContext = await test.step(`act: get page context for "${CATEGORY_PERMALINK}"`, () =>
      getPageContext(graphqlClient, frontendContext, CATEGORY_PERMALINK));

    await test.step("assert: permalink resolves to the category", async () => {
      expect(pageContext?.slugInfo?.entityInfo?.semanticUrl).toBe(CATEGORY_PERMALINK);
    });
  });

  test("report the registered user", async ({ graphqlClient, frontendContext }) => {
    const pageContext = await test.step("act: get page context", () => getPageContext(graphqlClient, frontendContext));

    await test.step("assert: user is the signed-in user", async () => {
      expect(pageContext?.user?.userName).toBe(REGISTERED_USERNAME);
    });
  });
});

test.describe("page context (customer account)", () => {
  test("return the white-labeling settings of the organization", {
    annotation: {
      type: "leaves data",
      description:
        "The platform cannot delete white-labeling settings; cleanup disables the setting, which stays behind for the deleted organization",
    },
  }, async ({ customerAccount, platformAdminHttpClient, cleanupStack }) => {
    const { graphqlClient, context } = customerAccount;
    const { organizationId } = requireFields(context, ["organizationId"], "Customer account context");
    const menuLinkListsClient = new MenuLinkListsClient(platformAdminHttpClient, context.storeId);
    const footer = newMenuLinkList(context.storeId);
    const mainMenu = newMenuLinkList(context.storeId);
    await test.step("arrange: footer and main menu link lists", async () => {
      for (const list of [footer, mainMenu]) {
        cleanupStack.push(`delete menu link list ${list.name}`, () => menuLinkListsClient.delete(list.id));
        await menuLinkListsClient.save(list);
      }
    });
    await test.step("arrange: white-labeling of the organization", () =>
      arrangeWhiteLabeling(new WhiteLabelingClient(platformAdminHttpClient), cleanupStack, {
        organizationId,
        logoUrl: LOGO_URL,
        footerLinkListName: footer.name,
        mainMenuLinkListName: mainMenu.name,
      }));

    const pageContext = await test.step("act: get page context", () => getPageContext(graphqlClient, context));

    await test.step("assert: the logo and both menus come from the organization's settings", async () => {
      expect(pageContext?.whiteLabelingSettings).toMatchObject({
        logoUrl: LOGO_URL,
        footerLinks: linksOf(footer),
        mainMenuLinks: linksOf(mainMenu),
      });
    });
  });
});

function linksOf(list: MenuLinkListDraft): object[] {
  return requireFields(list, ["menuLinks"], `Menu link list ${list.name}`).menuLinks.map(({ title, url }) =>
    expect.objectContaining({ title, url }),
  );
}

async function getPageContext(graphqlClient: GraphqlClient, context: FrontendContext, permalink?: string) {
  const { pageContext } = await graphqlClient.execute(PageContextDocument, {
    storeId: context.storeId,
    userId: context.userId,
    cultureName: context.cultureName,
    organizationId: context.organizationId,
    ...(permalink === undefined ? {} : { permalink }),
  });
  return pageContext;
}
