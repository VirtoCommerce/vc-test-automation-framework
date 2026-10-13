import type { Secret } from "@core/secret";

/**
 * User name and password for the platform or the frontend: the env admin, dataset users or test-created users.
 * The password is a {@link Secret}, so credentials are safe to log.
 */
export interface Credentials {
  /** Platform user name; for dataset frontend users, their e-mail address. */
  readonly username: string;
  /** Revealed only where it is sent, such as a sign-in request. */
  readonly password: Secret;
}
