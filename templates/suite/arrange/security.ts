import type { Credentials } from "@virtocommerce/test-automation-framework/auth";
import type { ArrangeContext } from "./context.ts";

import { newPlatformUser } from "../builders/security.ts";
import { requireFields } from "../support/require-fields.ts";

/** A platform user that `arrange` created. */
export interface PlatformUser {
  readonly id: string;
  readonly userName: string;
}

/** A platform user that `arrange` created, with the credentials to sign in. */
export interface PlatformAccount {
  readonly user: PlatformUser;
  readonly credentials: Credentials;
}

/** The security methods of `arrange`. */
export interface SecurityArrange {
  /**
   * Creates an approved platform user of the store under test, with no roles, and deletes it after the test.
   *
   * @throws {Error} The platform refuses the user, with the reasons.
   */
  platformUser(): Promise<PlatformAccount>;
  /** Deletes a user after the test, such as one that the code under test creates. */
  deleteUserLater(userName: string): void;
}

interface SecurityResult {
  readonly succeeded?: boolean;
  readonly errors?: readonly unknown[] | null;
}

interface ApplicationUser {
  readonly id?: string | null;
  readonly userName?: string | null;
}

const USERS_PATH = "/api/platform/security/users";

/**
 * Returns the security methods of `arrange`.
 *
 * @param context - What the methods create and remove data with.
 * @returns The methods.
 */
export function securityArrange({ admin, store, later }: ArrangeContext): SecurityArrange {
  function deleteUserLater(userName: string): void {
    later(`delete the user ${userName}`, async () =>
      (await (await admin()).delete(USERS_PATH, { query: { names: [userName] } })).expectOk(),
    );
  }

  async function platformUser(): Promise<PlatformAccount> {
    const client = await admin();
    const draft = newPlatformUser(store.id);
    const result = (
      await client.post(`${USERS_PATH}/create`, { json: { ...draft, password: draft.password.reveal() } })
    )
      .expectOk()
      .json<SecurityResult>();
    deleteUserLater(draft.userName);
    if (result.succeeded !== true) {
      throw new Error(`Creating the user ${draft.userName} failed: ${JSON.stringify(result.errors)}`);
    }
    const user = (await client.get(`${USERS_PATH}/${encodeURIComponent(draft.userName)}`))
      .expectOk()
      .json<ApplicationUser>();
    return {
      user: requireFields(user, ["id", "userName"], `The user ${draft.userName}`),
      credentials: { username: draft.userName, password: draft.password },
    };
  }

  return { platformUser, deleteUserLater };
}
