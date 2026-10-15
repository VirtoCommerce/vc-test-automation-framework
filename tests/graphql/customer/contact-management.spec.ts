import * as allure from "allure-js-commons";

import {
  ChangeOrganizationContactRoleDocument,
  GetContactLockStatusDocument,
  GetContactRolesInOrganizationDocument,
  LockOrganizationContactDocument,
  UnlockOrganizationContactDocument,
} from "@api/graphql/generated/graphql";
import { MODULES } from "@dataset/modules";
import { expect, test } from "@fixtures";

const MAINTAINER_ROLE = "role-org-maintainer";
const TARGET_ROLE = "role-purchasing-agent";

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Customer / Contact Management");
});

test.describe("organization contact roles (organization maintainer)", () => {
  test.use({ requiresModules: [MODULES.storeCompanyRoles] });

  test("change the role of an organization contact", async ({ arrange, env }) => {
    await allure.story("Roles");
    await allure.description("An organization's maintainer gives an employee of the organization another role.");
    const maintainer = await test.step("arrange: an organization with its maintainer", () =>
      arrange.customers.customerAccount({ role: MAINTAINER_ROLE }));
    const employee = await test.step("arrange: an employee of the maintainer's organization", () =>
      arrange.customers.customerAccount({ organizationId: maintainer.organizationId }));

    const { changeOrganizationContactRole } = await test.step(`act: give the employee the ${TARGET_ROLE} role`, () =>
      maintainer.api.graphql.execute(ChangeOrganizationContactRoleDocument, {
        command: { memberId: employee.contactId, roleIds: [TARGET_ROLE], storeId: env.storeId },
      }));

    await test.step(`assert: the employee has the ${TARGET_ROLE} role in the organization`, async () => {
      const { contact } = await maintainer.api.graphql.execute(GetContactRolesInOrganizationDocument, {
        id: employee.contactId,
      });
      expect(changeOrganizationContactRole?.succeeded).toBe(true);
      expect(contact?.rolesInOrganization?.map((role) => role?.id)).toContain(TARGET_ROLE);
    });
  });
});

test.describe("organization contact locks (organization maintainer)", () => {
  test.use({ requiresModules: [MODULES.organizationLocks] });

  test("lock and unlock an organization contact", async ({ arrange }) => {
    await allure.story("Locks");
    await allure.description("An organization's maintainer locks an employee in the organization and unlocks them.");
    const maintainer = await test.step("arrange: an organization with its maintainer", () =>
      arrange.customers.customerAccount({ role: MAINTAINER_ROLE }));
    const employee = await test.step("arrange: an employee of the maintainer's organization", () =>
      arrange.customers.customerAccount({ organizationId: maintainer.organizationId }));

    await test.step("act: lock the employee", () =>
      maintainer.api.graphql.execute(LockOrganizationContactDocument, { command: { memberId: employee.contactId } }));
    await test.step("assert: the employee is locked in the organization", async () => {
      const { contact } = await maintainer.api.graphql.execute(GetContactLockStatusDocument, {
        id: employee.contactId,
      });
      expect(contact?.isLockedInOrganization).toBe(true);
    });

    await test.step("act: unlock the employee", () =>
      maintainer.api.graphql.execute(UnlockOrganizationContactDocument, { command: { memberId: employee.contactId } }));
    await test.step("assert: the employee is unlocked", async () => {
      const { contact } = await maintainer.api.graphql.execute(GetContactLockStatusDocument, {
        id: employee.contactId,
      });
      expect(contact?.isLockedInOrganization).toBe(false);
    });
  });
});
