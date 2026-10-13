import type { Credentials } from "@api/auth/credentials";
import type { SecurityResult } from "@api/rest/types/security";
import type { Logger } from "@core/logger";
import type { Secret } from "@core/secret";

/** What syncing passwords needs of the platform: a sign-in check and an administrator's password reset. */
export interface UserPasswordApi {
  readonly canSignIn: (credentials: Credentials) => Promise<boolean>;
  readonly resetPassword: (userName: string, password: Secret) => Promise<SecurityResult>;
}

/**
 * Resets the password of every dataset user who cannot sign in with the dataset password, so a changed
 * `USERS_PASSWORD` reaches users an earlier seed created. Users who already sign in are left alone, which also
 * keeps the platform's password history from rejecting a reset to the same password.
 *
 * @throws Error when the platform refuses a reset, with its errors.
 */
export async function applyUserPasswords(
  api: UserPasswordApi,
  users: readonly Credentials[],
  logger: Logger,
): Promise<void> {
  let reset = 0;
  for (const credentials of users) {
    if (await api.canSignIn(credentials)) {
      continue;
    }
    const result = await api.resetPassword(credentials.username, credentials.password);
    if (result.succeeded !== true) {
      throw new Error(`Resetting the password of ${credentials.username} failed: ${JSON.stringify(result.errors)}`);
    }
    reset += 1;
  }
  logger.info(`users: ${reset} of ${users.length} passwords reset to the dataset password`);
}
