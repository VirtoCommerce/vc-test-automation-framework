import type { ApiSession } from "@api/api-session";
import type { Credentials } from "@api/auth/credentials";
import type { ApplicationUser, OAuthApp, Role, UserApiKey } from "@api/rest/types/security";
import type { CleanupStack } from "@core/cleanup-stack";
import type { Secret } from "@core/secret";
import type { StoreUnderTest } from "../store-under-test";
import type { ArrangeContext } from "./context";

import { newApiKey, newOAuthApp, newPlatformUser, newRole } from "../builders/security";
import { expectSucceeded } from "./context";

/** Back-office (platform) user, not signed in. */
export interface PlatformAccount {
  readonly user: ApplicationUser;
  readonly credentials: Credentials;
}

/** API key of a user. */
export interface ArrangedApiKey {
  readonly key: UserApiKey;
  /** The raw key value to send with requests. */
  readonly value: Secret;
}

/** Arranges back-office users, API keys, roles, OAuth apps and signed-in sessions. */
export class SecurityArrange {
  readonly #admin: ApiSession;
  readonly #cleanup: CleanupStack;
  readonly #store: StoreUnderTest;

  constructor({ admin, cleanup, store }: ArrangeContext) {
    this.#admin = admin;
    this.#cleanup = cleanup;
    this.#store = store;
  }

  /**
   * Creates a back-office user with no roles and deletes it after the test; it is not signed in (see
   * {@link SecurityArrange#signIn}). Use {@link CustomerArrange#customerAccount} for a frontend customer.
   *
   * @param overrides - Such as `isAdministrator` or `emailConfirmed`.
   */
  async platformUser(overrides: Parameters<typeof newPlatformUser>[1] = {}): Promise<PlatformAccount> {
    const draft = newPlatformUser(this.#store.id, overrides);
    const { users } = this.#admin.rest;
    this.#cleanup.push(`delete user ${draft.userName}`, () => users.delete([draft.userName]));
    expectSucceeded(
      await users.create({ ...draft, password: draft.password.reveal() }),
      `Creating user ${draft.userName}`,
    );
    return {
      user: await users.get(draft.userName),
      credentials: { username: draft.userName, password: draft.password },
    };
  }

  /**
   * Creates an active API key for a user and deletes all the user's keys after the test.
   *
   * @throws Error when the user does not end up with exactly one key.
   */
  async apiKey(user: ApplicationUser): Promise<ArrangedApiKey> {
    const { apiKeys } = this.#admin.rest.users;
    const value = newApiKey();
    this.deleteApiKeysLater(user);
    await apiKeys.create({ userId: user.id, userName: user.userName, apiKey: value.reveal(), isActive: true });
    const [key, ...others] = await apiKeys.list(user.id);
    if (key === undefined || others.length > 0) {
      throw new Error(
        `User ${user.userName} has ${others.length + (key === undefined ? 0 : 1)} API keys, expected one`,
      );
    }
    return { key, value };
  }

  /** Deletes all API keys of the user after the test, for keys the code under test creates. */
  deleteApiKeysLater(user: ApplicationUser): void {
    const { apiKeys } = this.#admin.rest.users;
    this.#cleanup.push(`delete the API keys of ${user.userName}`, async () => {
      const keys = await apiKeys.list(user.id);
      if (keys.length > 0) {
        await apiKeys.delete(keys.map(({ id }) => id));
      }
    });
  }

  /**
   * Creates a platform role and deletes it after the test.
   *
   * @param permissionNames - Such as `security:call_api`; none by default.
   * @returns The role as the platform stores it.
   */
  async role(permissionNames: readonly string[] = []): Promise<Role> {
    const { roles } = this.#admin.rest;
    const draft = newRole(permissionNames);
    this.deleteRoleLater(draft.name);
    expectSucceeded(await roles.save(draft), `Creating role ${draft.name}`);
    return roles.get(draft.name);
  }

  /** Deletes the role with this name after the test, if it exists then; for roles the code under test creates. */
  deleteRoleLater(name: string): void {
    const { roles } = this.#admin.rest;
    this.#cleanup.push(`delete role ${name}`, async () => {
      const role = await roles.find(name);
      if (role !== undefined) {
        await roles.delete([role.id]);
      }
    });
  }

  /** Creates a confidential OAuth app and deletes it after the test. */
  async oauthApp(): Promise<OAuthApp> {
    const { oauthApps } = this.#admin.rest;
    const draft = newOAuthApp();
    this.#cleanup.push(`delete OAuth app ${draft.clientId}`, () => oauthApps.delete([draft.clientId]));
    return oauthApps.create(draft);
  }

  /**
   * Signs a user in and signs them out after the test, e.g. a {@link SecurityArrange#platformUser}.
   * {@link CustomerArrange#customerAccount} already signs its customer in.
   */
  async signIn(credentials: Credentials): Promise<ApiSession> {
    const session = await this.#admin.as(credentials);
    this.#cleanup.push(`sign out ${credentials.username}`, () => session.signOut());
    return session;
  }
}
