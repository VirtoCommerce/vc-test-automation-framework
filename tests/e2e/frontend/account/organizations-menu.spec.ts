import * as allure from "allure-js-commons";

import { requireFields } from "@core/required-fields";
import { uniqueId } from "@core/unique-id";
import { MODULES } from "@dataset/modules";
import { expect, test } from "@fixtures";

const NO_MATCH = "NonExistentOrg";
const SEARCH_THRESHOLD = 10;
const DASHBOARD_PATH = /\/account\/dashboard/;

test.beforeEach(async () => {
  await allure.epic("E2E");
  await allure.feature("Frontend / Organizations menu");
});

test.describe("organizations menu (customer of their own)", () => {
  test.use({ shopperKind: "customer" });

  test("switch the active organization", async ({ frontend, shopper, arrange }) => {
    await allure.story("Switch organization");
    await allure.description("Selecting another organization in the account menu shows its name in the header.");
    const account = requireFields(shopper.account, ["organizationId"], "Customer");
    const { name: defaultName } = await test.step("arrange: the customer's organization", () =>
      arrange.admin.rest.customers.organizations.get(account.organizationId));
    const otherName = uniqueId("test-organization");
    await test.step(`arrange: a membership in ${otherName}`, async () =>
      arrange.customers.membership(account, await arrange.customers.organization(otherName)));
    const home = frontend.home();
    const { topHeader } = home;

    await test.step(`arrange: the header shows ${defaultName}`, async () => {
      await home.navigate();
      await expect(topHeader.organizationNameLabel).toHaveText(defaultName);
    });

    await test.step(`act: switch to ${otherName}`, async () => {
      await topHeader.openAccountMenu();
      await topHeader.accountMenu.organizationOption(otherName).click();
    });

    await test.step(`assert: the header shows ${otherName}`, async () => {
      await expect(topHeader.organizationNameLabel).toHaveText(otherName);
    });
  });
});

test.describe("organizations menu search (customer of their own)", () => {
  test.use({ shopperKind: "customer", requiresModules: [MODULES.xProfile] });

  test("search organizations by part of their name", async ({ frontend, shopper, arrange }) => {
    await allure.story("Search organizations");
    await allure.description(
      `With ${SEARCH_THRESHOLD} organizations the account menu offers a search, which finds them by part of their name.`,
    );
    const account = requireFields(shopper.account, ["organizationId"], "Customer");
    const token = uniqueId("org");
    const matching = [`${token} Alpha`, `${token} Beta`];
    const fillers = Array.from({ length: SEARCH_THRESHOLD - matching.length }, () => uniqueId("test-organization"));
    await test.step(`arrange: memberships in ${SEARCH_THRESHOLD} more organizations`, () =>
      arrange.customers.searchableMemberships(account, [...matching, ...fillers]));
    const home = frontend.home();
    const { accountMenu } = home.topHeader;

    await test.step("arrange: open the account menu", async () => {
      await home.navigate();
      await home.topHeader.openAccountMenu();
    });

    await test.step(`act: search for "${token}"`, () => accountMenu.searchOrganizations(token));

    await test.step(`assert: the organizations named "${token} …" are listed, the others are not`, async () => {
      for (const name of matching) {
        await expect(accountMenu.organization(name)).toBeVisible();
      }
      for (const name of fillers) {
        await expect(accountMenu.organization(name)).toHaveCount(0);
      }
    });
  });

  test("searching organizations without matches shows the empty state", async ({ frontend, shopper, arrange }) => {
    await allure.story("Search organizations");
    await allure.description("A search no organization matches shows the empty state.");
    const account = requireFields(shopper.account, ["organizationId"], "Customer");
    await test.step(`arrange: memberships in ${SEARCH_THRESHOLD} more organizations`, () =>
      arrange.customers.searchableMemberships(
        account,
        Array.from({ length: SEARCH_THRESHOLD }, () => uniqueId("test-organization")),
      ));
    const home = frontend.home();
    const { accountMenu } = home.topHeader;

    await test.step("arrange: open the account menu", async () => {
      await home.navigate();
      await home.topHeader.openAccountMenu();
    });

    await test.step(`act: search for "${NO_MATCH}"`, () => accountMenu.searchOrganizations(NO_MATCH));

    await test.step("assert: the empty state is shown", async () => {
      await expect(accountMenu.organizationsEmptyList).toBeVisible();
    });
  });
});

test.describe("organizations menu with locked memberships (anonymous, then signing in)", () => {
  test.use({ requiresModules: [MODULES.xProfile] });

  test("a locked organization stays listed but cannot be selected", async ({ frontend, page, arrange }) => {
    await allure.story("Locked membership");
    await allure.description(
      "A locked membership's organization is listed but disabled, while the default organization stays selectable.",
    );
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
    const { name: defaultName } = await arrange.admin.rest.customers.organizations.get(customer.organizationId);
    const lockedName = uniqueId("test-organization");
    await test.step(`arrange: a locked membership in ${lockedName}`, async () => {
      const membership = await arrange.customers.membership(customer, await arrange.customers.organization(lockedName));
      await arrange.customers.lockMemberships(customer, [membership]);
    });
    const signIn = frontend.signIn();
    const home = frontend.home();
    const { accountMenu } = home.topHeader;

    await test.step(`act: sign in as ${customer.credentials.username} and open the account menu`, async () => {
      await signIn.navigate();
      await signIn.signIn(customer.credentials.username, customer.credentials.password);
      await page.waitForURL((url) => !url.pathname.startsWith(signIn.path));
      await home.navigate();
      await home.topHeader.openAccountMenu();
    });

    await test.step(`assert: ${lockedName} is listed but disabled, ${defaultName} is selectable`, async () => {
      await expect(accountMenu.organization(lockedName)).toBeVisible();
      await expect(accountMenu.organizationOption(lockedName)).toBeDisabled();
      await expect(accountMenu.organizationOption(defaultName)).toBeEnabled();
    });
  });

  test("with every organization locked the list is disabled and account pages stay reachable", async ({
    frontend,
    page,
    arrange,
  }) => {
    await allure.story("Locked membership");
    await allure.description(
      "With every membership locked, every organization is disabled, but the account dashboard still opens.",
    );
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
    await test.step("arrange: both of the customer's memberships are locked", async () => {
      const other = await arrange.customers.membership(customer, await arrange.customers.organization());
      await arrange.customers.lockMemberships(customer, [customer.membership, other]);
    });
    const signIn = frontend.signIn();
    const home = frontend.home();
    const { accountMenu } = home.topHeader;

    await test.step(`act: sign in as ${customer.credentials.username} and open the account menu`, async () => {
      await signIn.navigate();
      await signIn.signIn(customer.credentials.username, customer.credentials.password);
      await page.waitForURL((url) => !url.pathname.startsWith(signIn.path));
      await home.navigate();
      await home.topHeader.openAccountMenu();
    });

    await test.step("assert: both organizations are listed and disabled", async () => {
      await expect(accountMenu.organizationOptions).toHaveCount(2);
      for (const option of await accountMenu.organizationOptions.all()) {
        await expect(option).toBeDisabled();
      }
    });

    await test.step("act: open the dashboard", () => accountMenu.dashboardLink.click());
    await test.step("assert: the dashboard opens", async () => {
      await expect(page).toHaveURL(DASHBOARD_PATH);
    });
  });

  test("reopening the menu picks up a lock applied while it was closed", async ({ frontend, page, arrange }) => {
    await allure.story("Locked membership");
    await allure.description("A membership locked while the account menu is closed shows as disabled once reopened.");
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
    const otherName = uniqueId("test-organization");
    const other = await test.step(`arrange: a membership in ${otherName}`, async () =>
      arrange.customers.membership(customer, await arrange.customers.organization(otherName)));
    const signIn = frontend.signIn();
    const home = frontend.home();
    const { topHeader } = home;
    const { accountMenu } = topHeader;

    await test.step(`arrange: sign in and see ${otherName} selectable, then close the menu`, async () => {
      await signIn.navigate();
      await signIn.signIn(customer.credentials.username, customer.credentials.password);
      await page.waitForURL((url) => !url.pathname.startsWith(signIn.path));
      await home.navigate();
      await topHeader.openAccountMenu();
      await expect(accountMenu.organizationOption(otherName)).toBeEnabled();
      await topHeader.accountButton.click();
      await expect(accountMenu.root).toBeHidden();
    });

    await test.step(`act: lock the membership in ${otherName}`, () =>
      arrange.admin.rest.organizationMemberships.lock(other.id));

    await test.step(`assert: after reopening the menu, ${otherName} is disabled`, async () => {
      await topHeader.accountButton.click();
      await expect(accountMenu.organizationOption(otherName)).toBeDisabled();
    });
  });
});
