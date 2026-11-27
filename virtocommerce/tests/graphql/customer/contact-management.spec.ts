import { expect, test } from "@fixtures";
import {
  ChangeOrganizationContactRoleDocument,
  GetContactLockStatusDocument,
  GetContactRolesInOrganizationDocument,
  LockOrganizationContactDocument,
  UnlockOrganizationContactDocument,
} from "@graphql/generated/graphql.ts";
import { MODULES } from "@modules";

const MAINTAINER_ROLE = "role-org-maintainer";
const TARGET_ROLE = "role-purchasing-agent";

test.describe("organization contact management (organization maintainer)", () => {
  test.use({ modules: { xProfile: MODULES.xProfile } });

  test("change the role of an organization contact", async ({ arrange, store }) => {
    const maintainer = await test.step("arrange: an organization with its maintainer", () =>
      arrange.customers.customer({ role: MAINTAINER_ROLE }));
    const employee = await test.step("arrange: an employee of the maintainer's organization", () =>
      arrange.customers.customer({ organizationId: maintainer.organizationId }));

    const { changeOrganizationContactRole } = await test.step(`act: give the employee the ${TARGET_ROLE} role`, () =>
      maintainer.graphql.execute(ChangeOrganizationContactRoleDocument, {
        command: { memberId: employee.contactId, roleIds: [TARGET_ROLE], storeId: store.id },
      }));

    await test.step(`assert: the employee has the ${TARGET_ROLE} role in the organization`, async () => {
      const { contact } = await maintainer.graphql.execute(GetContactRolesInOrganizationDocument, {
        id: employee.contactId,
      });
      expect(changeOrganizationContactRole?.succeeded).toBe(true);
      expect(contact?.rolesInOrganization?.map((role) => role?.id)).toContain(TARGET_ROLE);
    });
  });

  test("lock and unlock an organization contact", async ({ arrange }) => {
    const maintainer = await test.step("arrange: an organization with its maintainer", () =>
      arrange.customers.customer({ role: MAINTAINER_ROLE }));
    const employee = await test.step("arrange: an employee of the maintainer's organization", () =>
      arrange.customers.customer({ organizationId: maintainer.organizationId }));

    await test.step("act: lock the employee", () =>
      maintainer.graphql.execute(LockOrganizationContactDocument, { command: { memberId: employee.contactId } }));
    await test.step("assert: the employee is locked in the organization", async () => {
      const { contact } = await maintainer.graphql.execute(GetContactLockStatusDocument, {
        id: employee.contactId,
      });
      expect(contact?.isLockedInOrganization).toBe(true);
    });

    await test.step("act: unlock the employee", () =>
      maintainer.graphql.execute(UnlockOrganizationContactDocument, { command: { memberId: employee.contactId } }));
    await test.step("assert: the employee is unlocked", async () => {
      const { contact } = await maintainer.graphql.execute(GetContactLockStatusDocument, {
        id: employee.contactId,
      });
      expect(contact?.isLockedInOrganization).toBe(false);
    });
  });
});
