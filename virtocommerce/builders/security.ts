import type {
  VirtoCommercePlatformCoreSecurityApplicationUser as ApplicationUser,
  OpenIddictAbstractionsOpenIddictApplicationDescriptor as OAuthApp,
  VirtoCommercePlatformCoreSecurityRole as Role,
} from "../rest/generated/platform.ts";

import { randomUUID } from "node:crypto";

import { Secret } from "@virtocommerce/test-automation-framework/core";

import { uniqueId } from "../support/unique-id.ts";

/**
 * Returns a new password that meets the password policy of the platform.
 *
 * @returns The password, masked in reports.
 */
export function newPassword(): Secret {
  return Secret.of(`Test-${randomUUID()}!aA1`);
}

/**
 * Returns a new API key value.
 *
 * @returns The key, masked in reports.
 */
export function newApiKey(): Secret {
  return Secret.of(randomUUID().replaceAll("-", ""));
}

/** A platform user to create, with a password kept secret until it is sent. */
export interface UserDraft extends Omit<ApplicationUser, "password"> {
  readonly userName: string;
  readonly email: string;
  readonly password: Secret;
}

/**
 * Returns a new approved back-office user without roles.
 *
 * @param storeId - The store of the user.
 * @param overrides - Fields to change, such as `roles`.
 * @returns The user, with a unique user name that is also their e-mail.
 */
export function newPlatformUser(
  storeId: string,
  overrides: Omit<Partial<ApplicationUser>, "userName" | "email" | "password"> = {},
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
 * Returns a new role.
 *
 * @param permissionNames - The permissions of the role, none by default.
 * @returns The role, with a unique name.
 */
export function newRole(permissionNames: readonly string[] = []): Role & { readonly name: string } {
  return { name: uniqueId("test-role"), description: "", permissions: permissionNames.map((name) => ({ name })) };
}

/**
 * Returns a new OAuth app.
 *
 * @returns The app, with a unique client id that is also its display name.
 */
export function newOAuthApp(): OAuthApp & { readonly clientId: string; readonly displayName: string } {
  const clientId = uniqueId("test-client");
  return { clientId, displayName: clientId, clientSecret: newPassword().reveal() };
}
