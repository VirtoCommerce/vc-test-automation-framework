import type { Secret } from "@/core";

/** The sign-in data of a platform or frontend user. It is safe to log, because the password is a {@link Secret}. */
export interface Credentials {
  /** The user name. For a frontend user, it is usually the e-mail address. */
  readonly username: string;
  /** The password of the user. */
  readonly password: Secret;
  /** The store that a frontend user signs in to. It is omitted for platform users, such as the administrator. */
  readonly storeId?: string;
}
