import { randomUUID } from "node:crypto";

import { Secret } from "@virtocommerce/test-automation-framework/core";

import { uniqueId } from "../support/unique-id.ts";

/** A platform user to create, with a password kept secret until it is sent. */
export interface UserDraft {
  readonly userName: string;
  readonly email: string;
  readonly password: Secret;
  readonly userType: string;
  readonly storeId: string;
  readonly status: string;
  readonly emailConfirmed: boolean;
  readonly roles: readonly unknown[];
}

/**
 * Returns a new password that meets the platform's password rules.
 *
 * @returns The password, masked in reports.
 */
export function newPassword(): Secret {
  return Secret.of(`Test-${randomUUID()}!aA1`);
}

/**
 * Returns a new approved platform user of a store, with a unique name and no roles.
 *
 * @param storeId - The store of the user.
 * @returns The user to create.
 */
export function newPlatformUser(storeId: string): UserDraft {
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
  };
}
