import type { CustomersClient } from "@api/rest/clients/customers-client";
import type { RolesClient } from "@api/rest/clients/roles-client";
import type { UsersClient } from "@api/rest/clients/users-client";
import type {
  ApplicationUser,
  IdentityResult,
  Role,
  RoleData,
  SecurityResult,
  UserApiKey,
} from "@api/rest/types/security";
import type { CleanupStack } from "@core/cleanup-stack";
import type { UserDraft } from "../builders/security";

import { USER_API_KEY_FIELDS } from "@api/rest/types/security";
import { requireFields } from "@core/required-fields";

export function expectSucceeded(result: SecurityResult | IdentityResult, label: string): void {
  if (result.succeeded !== true) {
    throw new Error(`${label} failed: ${JSON.stringify(result.errors)}`);
  }
}

export async function arrangeUser(
  usersClient: UsersClient,
  cleanupStack: CleanupStack,
  draft: UserDraft,
): Promise<ApplicationUser> {
  cleanupStack.push(`delete user ${draft.userName}`, () => usersClient.delete([draft.userName]));
  expectSucceeded(await usersClient.create(draft), `Create user ${draft.userName}`);
  return usersClient.get(draft.userName);
}

export async function arrangeRole(
  rolesClient: RolesClient,
  cleanupStack: CleanupStack,
  draft: RoleData & { readonly name: string },
): Promise<Role> {
  registerRoleRemoval(rolesClient, cleanupStack, draft.name);
  expectSucceeded(await rolesClient.save(draft), `Create role ${draft.name}`);
  return rolesClient.get(draft.name);
}

export function registerRoleRemoval(rolesClient: RolesClient, cleanupStack: CleanupStack, name: string): void {
  cleanupStack.push(`delete role ${name}`, async () => {
    const role = await rolesClient.find(name);
    if (role !== undefined) {
      await rolesClient.delete([role.id]);
    }
  });
}

export async function arrangeApiKey(
  usersClient: UsersClient,
  cleanupStack: CleanupStack,
  user: ApplicationUser,
  apiKey: string,
): Promise<UserApiKey & { apiKey: string }> {
  cleanupStack.push(`delete API key of ${user.userName}`, async () => {
    const created = (await usersClient.listApiKeys(user.id)).find((key) => key.apiKey === apiKey);
    if (created !== undefined) {
      await usersClient.deleteApiKeys([created.id]);
    }
  });
  await usersClient.createApiKey({ userId: user.id, userName: user.userName, apiKey, isActive: true });
  const created = (await usersClient.listApiKeys(user.id)).find((key) => key.apiKey === apiKey);
  return requireFields(created, [...USER_API_KEY_FIELDS, "apiKey"], `API key of ${user.userName}`);
}

export function registerAccountRemoval(
  usersClient: UsersClient,
  customersClient: CustomersClient,
  cleanupStack: CleanupStack,
  userName: string,
): void {
  cleanupStack.push(`delete account ${userName} and its contact`, async () => {
    const user = await usersClient.find(userName);
    await usersClient.delete([userName]);
    if (user?.memberId) {
      await customersClient.contacts.delete([user.memberId]);
    }
  });
}
