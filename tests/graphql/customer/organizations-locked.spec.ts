import * as allure from "allure-js-commons";

import { GetOrganizationsDocument } from "@api/graphql/generated/graphql";
import { expect, test } from "@fixtures";

const ORGANIZATIONS_PAGE_SIZE = 200;
const LOCK_VISIBLE_TIMEOUT_MS = 20_000;
const DAY_MS = 24 * 60 * 60 * 1000;

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Customer / Locked Organizations");
});

test.describe("locked organizations (customer of their own)", () => {
  test("a locked organization stays listed, flagged as locked", async ({ arrange }) => {
    await allure.story("Locks");
    await allure.description(
      "A customer locked in one of their organizations still sees it listed, flagged as locked for them.",
    );
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
    const organizationId = await test.step("arrange: a second organization", () => arrange.customers.organization());
    const membership = await test.step("arrange: the customer's membership in the second organization", () =>
      arrange.customers.membership(customer, organizationId));
    await test.step("assert: the second organization is listed as not locked", async () => {
      const { me } = await customer.api.graphql.execute(GetOrganizationsDocument, { first: ORGANIZATIONS_PAGE_SIZE });
      expect(
        me?.contact?.organizations?.items?.find((item) => item?.id === organizationId)?.isLockedForCurrentUser,
      ).toBe(false);
    });

    await test.step("act: lock the customer in the second organization", () =>
      arrange.admin.rest.organizationMemberships.lock(membership.id));

    await test.step("assert: the organization stays listed, flagged as locked, and the page is complete", async () => {
      await expect
        .poll(
          async () => {
            const { me } = await customer.api.graphql.execute(GetOrganizationsDocument, {
              first: ORGANIZATIONS_PAGE_SIZE,
            });
            return me?.contact?.organizations?.items?.find((item) => item?.id === organizationId)
              ?.isLockedForCurrentUser;
          },
          { timeout: LOCK_VISIBLE_TIMEOUT_MS },
        )
        .toBe(true);
      const { me } = await customer.api.graphql.execute(GetOrganizationsDocument, { first: ORGANIZATIONS_PAGE_SIZE });
      expect(me?.contact?.organizations?.totalCount).toBe(me?.contact?.organizations?.items?.length);
    });
  });

  test("a timed lock counts only until it expires", async ({ arrange }) => {
    await allure.story("Locks");
    await allure.description(
      "A lock that ended yesterday is not reported; the same membership locked until tomorrow is, " +
        "which proves the lock is applied at all.",
    );
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
    const organizationId = await test.step("arrange: a second organization", () => arrange.customers.organization());
    const membership = await test.step("arrange: the customer's membership in the second organization", () =>
      arrange.customers.membership(customer, organizationId));

    await test.step("act: lock the customer until yesterday", () =>
      arrange.admin.rest.organizationMemberships.lock(membership.id, new Date(Date.now() - DAY_MS)));
    await test.step("assert: the organization is listed as not locked", async () => {
      const { me } = await customer.api.graphql.execute(GetOrganizationsDocument, { first: ORGANIZATIONS_PAGE_SIZE });
      expect(
        me?.contact?.organizations?.items?.find((item) => item?.id === organizationId)?.isLockedForCurrentUser,
      ).toBe(false);
    });

    await test.step("act: lock the customer until tomorrow", () =>
      arrange.admin.rest.organizationMemberships.lock(membership.id, new Date(Date.now() + DAY_MS)));
    await test.step("assert: the organization is listed as locked", async () => {
      await expect
        .poll(
          async () => {
            const { me } = await customer.api.graphql.execute(GetOrganizationsDocument, {
              first: ORGANIZATIONS_PAGE_SIZE,
            });
            return me?.contact?.organizations?.items?.find((item) => item?.id === organizationId)
              ?.isLockedForCurrentUser;
          },
          { timeout: LOCK_VISIBLE_TIMEOUT_MS },
        )
        .toBe(true);
    });
  });

  test("locking one user does not lock the organization for another user", async ({ arrange }) => {
    await allure.story("Locks");
    await allure.description(
      "A lock applies to one user's membership only; others in the organization are not locked.",
    );
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
    const organizationId = await test.step("arrange: a shared organization", () => arrange.customers.organization());
    const membership = await test.step("arrange: the customer's membership in the shared organization", () =>
      arrange.customers.membership(customer, organizationId));
    const colleague = await test.step("arrange: a second user of the shared organization", () =>
      arrange.customers.customerAccount({ organizationId }));

    await test.step("act: lock the first customer in the shared organization", () =>
      arrange.admin.rest.organizationMemberships.lock(membership.id));

    await test.step("assert: the first customer sees the organization as locked", async () => {
      await expect
        .poll(
          async () => {
            const { me } = await customer.api.graphql.execute(GetOrganizationsDocument, {
              first: ORGANIZATIONS_PAGE_SIZE,
            });
            return me?.contact?.organizations?.items?.find((item) => item?.id === organizationId)
              ?.isLockedForCurrentUser;
          },
          { timeout: LOCK_VISIBLE_TIMEOUT_MS },
        )
        .toBe(true);
    });
    await test.step("assert: the colleague sees it as not locked", async () => {
      const { me } = await colleague.api.graphql.execute(GetOrganizationsDocument, { first: ORGANIZATIONS_PAGE_SIZE });
      expect(
        me?.contact?.organizations?.items?.find((item) => item?.id === organizationId)?.isLockedForCurrentUser,
      ).toBe(false);
    });
  });
});
