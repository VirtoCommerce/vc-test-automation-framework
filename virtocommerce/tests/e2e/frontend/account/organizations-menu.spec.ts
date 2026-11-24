import type { VirtoCommerceCustomerModuleCoreModelOrganization as Organization } from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { customerOf } from "@arrange";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { MODULES } from "@modules";
import { requireFields } from "@support/require-fields.ts";
import { uniqueId } from "@support/unique-id.ts";

const NO_MATCH = "NonExistentOrg";
const SEARCH_THRESHOLD = 10;
const DASHBOARD_PATH = /\/account\/dashboard/;

test.describe("organizations menu (customer of their own)", () => {
  test.use({ user: STORE_ADMINISTRATOR, shopperAs: "customer" });

  test("switch the active organization", async ({ api, frontend, shopper, arrange }) => {
    const account = customerOf(shopper);
    const { name: defaultName } = await test.step("arrange: the customer's organization", () =>
      organizationOf(api, account.organizationId));
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
  test.use({ shopperAs: "customer", modules: { xProfile: MODULES.xProfile } });

  test("search organizations by part of their name", async ({ frontend, shopper, arrange }) => {
    const account = customerOf(shopper);
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
    const account = customerOf(shopper);
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
  test.use({ user: STORE_ADMINISTRATOR, modules: { xProfile: MODULES.xProfile } });

  test("a locked organization stays listed but cannot be selected", async ({ api, frontend, page, arrange }) => {
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customer());
    const { name: defaultName } = await organizationOf(api, customer.organizationId);
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
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customer());
    await test.step("arrange: both of the customer's memberships are locked", async () => {
      const other = await arrange.customers.membership(customer, await arrange.customers.organization());
      await arrange.customers.lockMemberships(customer, [customer.membershipId, other]);
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

  test("reopening the menu picks up a lock applied while it was closed", async ({ api, frontend, page, arrange }) => {
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customer());
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

    await test.step(`act: lock the membership in ${otherName}`, () => lockMembership(api, other));

    await test.step(`assert: after reopening the menu, ${otherName} is disabled`, async () => {
      await topHeader.accountButton.click();
      await expect(accountMenu.organizationOption(otherName)).toBeDisabled();
    });
  });
});

async function organizationOf(api: HttpClient, id: string): Promise<{ readonly name: string }> {
  const organization = (await api.get(`/api/organizations/${id}`)).expectOk().json<Organization>();
  return requireFields(organization, ["name"], `Organization ${id}`);
}

async function lockMembership(api: HttpClient, membershipId: string): Promise<void> {
  (await api.post(`/api/customer/organization-memberships/${membershipId}/lock`, { json: {} })).expectOk();
}
