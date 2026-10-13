import type { Credentials } from "@api/auth/credentials";
import type { Dataset } from "./dataset";

import { requireFields } from "@core/required-fields";
import { Secret } from "@core/secret";

/**
 * The dataset's store administrator, a platform administrator: tests arrange data, read the notification journal
 * and clean up as this user.
 */
export const STORE_ADMINISTRATOR = "acme_store_administrator@acme.com";

/**
 * Returns a dataset user's sign-in credentials, with the dataset's password as a {@link Secret}.
 *
 * @example
 * credentialsOf(dataset, STORE_ADMINISTRATOR);
 *
 * @throws Error when the dataset has no such user or the user has no password.
 */
export function credentialsOf(dataset: Dataset, userName: string): Credentials {
  const user = dataset.users.filter((record) => record.userName === userName)[0];
  if (user === undefined) {
    throw new Error(`Dataset has no user "${userName}"`);
  }
  const { password } = requireFields(user, ["password"], `Dataset user "${userName}"`);
  return { username: userName, password: new Secret(password) };
}
