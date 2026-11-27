import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { GetOrganizationsDocument } from "@graphql/generated/graphql.ts";
import { MODULES } from "@modules";

const ORGANIZATIONS_PAGE_SIZE = 200;
const LOCK_VISIBLE_TIMEOUT_MS = 20_000;
const DAY_MS = 24 * 60 * 60 * 1000;

test.describe("locked organizations (customer of their own)", () => {
  test.use({ user: STORE_ADMINISTRATOR, modules: { xProfile: MODULES.xProfile } });

  test("a locked organization stays listed, flagged as locked", async ({ api, arrange }) => {
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customer());
    const organizationId = await test.step("arrange: a second organization", () => arrange.customers.organization());
    const membershipId = await test.step("arrange: the customer's membership in the second organization", () =>
      arrange.customers.membership(customer, organizationId));
    await test.step("assert: the second organization is listed as not locked", async () => {
      const { me } = await customer.graphql.execute(GetOrganizationsDocument, {
        first: ORGANIZATIONS_PAGE_SIZE,
      });
      expect(
        me?.contact?.organizations?.items?.find((item) => item?.id === organizationId)?.isLockedForCurrentUser,
      ).toBe(false);
    });

    await test.step("act: lock the customer in the second organization", () => lock(api, membershipId));

    await test.step("assert: the organization stays listed, flagged as locked, and the page is complete", async () => {
      await expect
        .poll(
          async () => {
            const { me } = await customer.graphql.execute(GetOrganizationsDocument, {
              first: ORGANIZATIONS_PAGE_SIZE,
            });
            return me?.contact?.organizations?.items?.find((item) => item?.id === organizationId)
              ?.isLockedForCurrentUser;
          },
          { timeout: LOCK_VISIBLE_TIMEOUT_MS },
        )
        .toBe(true);
      const { me } = await customer.graphql.execute(GetOrganizationsDocument, {
        first: ORGANIZATIONS_PAGE_SIZE,
      });
      expect(me?.contact?.organizations?.totalCount).toBe(me?.contact?.organizations?.items?.length);
    });
  });

  test("a timed lock counts only until it expires", async ({ api, arrange }) => {
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customer());
    const organizationId = await test.step("arrange: a second organization", () => arrange.customers.organization());
    const membershipId = await test.step("arrange: the customer's membership in the second organization", () =>
      arrange.customers.membership(customer, organizationId));

    await test.step("act: lock the customer until yesterday", () =>
      lock(api, membershipId, new Date(Date.now() - DAY_MS)));
    await test.step("assert: the organization is listed as not locked", async () => {
      const { me } = await customer.graphql.execute(GetOrganizationsDocument, {
        first: ORGANIZATIONS_PAGE_SIZE,
      });
      expect(
        me?.contact?.organizations?.items?.find((item) => item?.id === organizationId)?.isLockedForCurrentUser,
      ).toBe(false);
    });

    await test.step("act: lock the customer until tomorrow", () =>
      lock(api, membershipId, new Date(Date.now() + DAY_MS)));
    await test.step("assert: the organization is listed as locked", async () => {
      await expect
        .poll(
          async () => {
            const { me } = await customer.graphql.execute(GetOrganizationsDocument, {
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

  test("locking one user does not lock the organization for another user", async ({ api, arrange }) => {
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customer());
    const organizationId = await test.step("arrange: a shared organization", () => arrange.customers.organization());
    const membershipId = await test.step("arrange: the customer's membership in the shared organization", () =>
      arrange.customers.membership(customer, organizationId));
    const colleague = await test.step("arrange: a second user of the shared organization", () =>
      arrange.customers.customer({ organizationId }));

    await test.step("act: lock the first customer in the shared organization", () => lock(api, membershipId));

    await test.step("assert: the first customer sees the organization as locked", async () => {
      await expect
        .poll(
          async () => {
            const { me } = await customer.graphql.execute(GetOrganizationsDocument, {
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
      const { me } = await colleague.graphql.execute(GetOrganizationsDocument, {
        first: ORGANIZATIONS_PAGE_SIZE,
      });
      expect(
        me?.contact?.organizations?.items?.find((item) => item?.id === organizationId)?.isLockedForCurrentUser,
      ).toBe(false);
    });
  });
});

async function lock(api: HttpClient, membershipId: string, lockoutEnd?: Date): Promise<void> {
  const json = lockoutEnd === undefined ? {} : { lockoutEnd: lockoutEnd.toISOString() };
  (await api.post(`/api/customer/organization-memberships/${membershipId}/lock`, { json })).expectOk();
}
