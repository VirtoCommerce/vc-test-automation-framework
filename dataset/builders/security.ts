import type { ApplicationUserData, OAuthAppData, RoleData } from "@api/rest/types/security";
import type { WithRequired } from "@core/required-fields";

import { randomUUID } from "node:crypto";

import { Secret } from "@core/secret";
import { uniqueId } from "@core/unique-id";

/** A user to create, with the password kept as a {@link Secret} until it is sent. */
export interface UserDraft extends WithRequired<Omit<ApplicationUserData, "password">, "userName" | "email"> {
  readonly password: Secret;
}

/** A role to create, with a unique name. */
export type RoleDraft = WithRequired<RoleData, "name">;

/** An OAuth app to create, with its client id chosen up front. */
export type OAuthAppDraft = WithRequired<OAuthAppData, "clientId" | "clientSecret" | "displayName">;

/** Builds a random password that meets the platform's password policy, as a {@link Secret}. */
export function newPassword(): Secret {
  return new Secret(`Test-${randomUUID()}!aA1`);
}

/** Builds an API key value of 32 random hex characters, as a {@link Secret}. */
export function newApiKey(): Secret {
  return new Secret(randomUUID().replaceAll("-", ""));
}

/**
 * Builds an approved admin (`Manager`) user with no roles, a confirmed unique `test-user-…@example.com`
 * user name and email and a random password. For frontend customers use `newCustomerUser`.
 *
 * @param overrides - Fields that differ, such as `isAdministrator` or `roles`.
 */
export function newPlatformUser(
  storeId: string,
  overrides: Omit<Partial<ApplicationUserData>, "userName" | "email" | "password"> = {},
): UserDraft {
  const userName = `${uniqueId("test-user")}@example.com`;
  return {
    userName,
    email: userName,
    password: newPassword(),
    userType: "Manager",
    storeId,
    status: "Approved",
    emailConfirmed: true,
    roles: [],
    ...overrides,
  };
}

/**
 * Builds a role named `test-role-…`.
 *
 * @param permissionNames - Such as `security:call_api`; none by default.
 */
export function newRole(permissionNames: readonly string[] = []): RoleDraft {
  return { name: uniqueId("test-role"), description: "", permissions: permissionNames.map((name) => ({ name })) };
}

/** Builds an OAuth app with a unique `test-client-…` client id (also its display name) and a random secret. */
export function newOAuthApp(): OAuthAppDraft {
  const clientId = uniqueId("test-client");
  return { clientId, displayName: clientId, clientSecret: newPassword().reveal() };
}
