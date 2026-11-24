import type { Credentials } from "@virtocommerce/test-automation-framework/auth";
import type { Secret } from "@virtocommerce/test-automation-framework/core";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";
import type {
  VirtoCommercePlatformCoreSecurityApplicationUser as ApplicationUser,
  OpenIddictAbstractionsOpenIddictApplicationDescriptor as OAuthApp,
  VirtoCommercePlatformCoreSecurityRole as Role,
  VirtoCommercePlatformCoreSecuritySecurityResult as SecurityResult,
  VirtoCommercePlatformCoreSecurityUserApiKey as UserApiKey,
} from "../rest/generated/platform.ts";
import type { WithRequired } from "../support/require-fields.ts";
import type { ArrangeContext } from "./context.ts";

import { newApiKey, newOAuthApp, newPlatformUser, newRole } from "../builders/security.ts";
import { requireFields } from "../support/require-fields.ts";
import { userNamed } from "../support/users.ts";

/** A back-office user as the platform saved it. */
export type PlatformUser = WithRequired<ApplicationUser, "id" | "userName" | "email">;

/** A back-office user created for one test, with the credentials that sign them in. */
export interface PlatformAccount {
  readonly user: PlatformUser;
  readonly credentials: Credentials;
}

/** An API key of a user, with its value, which the platform does not return. */
export interface ArrangedApiKey {
  readonly key: WithRequired<UserApiKey, "id">;
  readonly value: Secret;
}

/** A role as the platform saved it. */
export type ArrangedRole = WithRequired<Role, "id" | "name">;

/** An OAuth app as the platform saved it. */
export type ArrangedOAuthApp = WithRequired<OAuthApp, "clientId">;

/** Arranges back-office users, API keys, roles and OAuth apps. */
export interface SecurityArrange {
  /**
   * Creates an approved back-office user of the store, without roles by default, and deletes them after the test.
   *
   * @param overrides - Fields of the user, such as `roles`.
   * @throws {Error} The platform refuses the user, with the reasons.
   */
  platformUser(overrides?: Omit<Partial<ApplicationUser>, "userName" | "email" | "password">): Promise<PlatformAccount>;
  /** Deletes a user after the test, such as one that the code under test creates. */
  deleteUserLater(userName: string): void;
  /**
   * Gives a user an active API key and deletes the user's keys after the test.
   *
   * @throws {Error} The user ends up with other than one key.
   */
  apiKey(user: PlatformUser): Promise<ArrangedApiKey>;
  /** Deletes every API key of a user after the test, such as keys that the code under test creates. */
  deleteApiKeysLater(user: PlatformUser): void;
  /**
   * Creates a role and deletes it after the test.
   *
   * @param permissionNames - The permissions of the role, none by default.
   * @throws {Error} The platform refuses the role, with the reasons.
   */
  role(permissionNames?: readonly string[]): Promise<ArrangedRole>;
  /** Deletes a role after the test, unless it is already gone, such as a role that the code under test creates. */
  deleteRoleLater(name: string): void;
  /** Creates a confidential OAuth app and deletes it after the test. */
  oauthApp(): Promise<ArrangedOAuthApp>;
  /** Deletes an OAuth app after the test, such as one that the code under test creates. */
  deleteOAuthAppLater(clientId: string): void;
  /** Signs a user in, such as one that {@link SecurityArrange#platformUser} created, and signs them out after the test. */
  signIn(credentials: Credentials): Promise<HttpClient>;
}

const USERS_PATH = "/api/platform/security/users";
const API_KEYS_PATH = `${USERS_PATH}/apikeys`;
const ROLES_PATH = "/api/platform/security/roles";
const OAUTH_APPS_PATH = "/api/platform/oauthapps";

/**
 * Returns the security methods of `arrange`.
 *
 * @param context - What the methods create and remove data with.
 * @returns The methods.
 */
export function securityArrange({ admin, signIn, signOut, store, later }: ArrangeContext): SecurityArrange {
  async function platformUser(
    overrides: Omit<Partial<ApplicationUser>, "userName" | "email" | "password"> = {},
  ): Promise<PlatformAccount> {
    const client = await admin();
    const draft = newPlatformUser(store.id, overrides);
    const result = (
      await client.post(`${USERS_PATH}/create`, { json: { ...draft, password: draft.password.reveal() } })
    )
      .expectOk()
      .json<SecurityResult>();
    deleteUserLater(draft.userName);
    if (result.succeeded !== true) {
      throw new Error(`Creating the user ${draft.userName} failed: ${JSON.stringify(result.errors)}`);
    }
    const user = await userNamed(client, draft.userName);
    return {
      user: requireFields(user, ["id", "userName", "email"], `The user ${draft.userName}`),
      credentials: { username: draft.userName, password: draft.password },
    };
  }

  function deleteUserLater(userName: string): void {
    later(`delete user ${userName}`, async () =>
      (await (await admin()).delete(USERS_PATH, { query: { names: [userName] } })).expectOk(),
    );
  }

  async function apiKey(user: PlatformUser): Promise<ArrangedApiKey> {
    const client = await admin();
    const value = newApiKey();
    deleteApiKeysLater(user);
    (
      await client.post(API_KEYS_PATH, {
        json: { userId: user.id, userName: user.userName, apiKey: value.reveal(), isActive: true },
      })
    ).expectOk();
    const keys = await apiKeysOf(client, user);
    const [key] = keys;
    if (key === undefined || keys.length > 1) {
      throw new Error(`The user ${user.userName} has ${keys.length} API keys instead of one`);
    }
    return { key: requireFields(key, ["id"], `The API key of ${user.userName}`), value };
  }

  function deleteApiKeysLater(user: PlatformUser): void {
    later(`delete the API keys of ${user.userName}`, async () => {
      const client = await admin();
      const ids = (await apiKeysOf(client, user)).flatMap(({ id }) => (typeof id === "string" ? [id] : []));
      if (ids.length > 0) {
        (await client.delete(API_KEYS_PATH, { query: { ids } })).expectOk();
      }
    });
  }

  async function role(permissionNames: readonly string[] = []): Promise<ArrangedRole> {
    const client = await admin();
    const draft = newRole(permissionNames);
    deleteRoleLater(draft.name);
    const result = (await client.put(ROLES_PATH, { json: draft })).expectOk().json<SecurityResult>();
    if (result.succeeded !== true) {
      throw new Error(`Creating the role ${draft.name} failed: ${JSON.stringify(result.errors)}`);
    }
    return requireFields(await roleNamed(client, draft.name), ["id", "name"], `The role ${draft.name}`);
  }

  function deleteRoleLater(name: string): void {
    later(`delete role ${name}`, async () => {
      const client = await admin();
      const found = await roleNamed(client, name);
      if (typeof found?.id === "string") {
        (await client.delete(ROLES_PATH, { query: { ids: [found.id] } })).expectOk();
      }
    });
  }

  async function oauthApp(): Promise<ArrangedOAuthApp> {
    const client = await admin();
    const draft = newOAuthApp();
    const created = (await client.post(OAUTH_APPS_PATH, { json: draft })).expectOk().json<OAuthApp>();
    deleteOAuthAppLater(draft.clientId);
    return requireFields(created, ["clientId"], `The OAuth app ${draft.clientId}`);
  }

  function deleteOAuthAppLater(clientId: string): void {
    later(`delete OAuth app ${clientId}`, async () =>
      (await (await admin()).delete(OAUTH_APPS_PATH, { query: { clientIds: [clientId] } })).expectOk(),
    );
  }

  async function signedIn(credentials: Credentials): Promise<HttpClient> {
    const client = await signIn(credentials);
    later(`sign ${credentials.username} out`, () => signOut(credentials));
    return client;
  }

  return {
    platformUser,
    deleteUserLater,
    apiKey,
    deleteApiKeysLater,
    role,
    deleteRoleLater,
    oauthApp,
    deleteOAuthAppLater,
    signIn: signedIn,
  };
}

async function apiKeysOf(client: HttpClient, user: PlatformUser): Promise<UserApiKey[]> {
  return (await client.get(`${USERS_PATH}/${encodeURIComponent(user.id)}/apikeys`)).expectOk().json<UserApiKey[]>();
}

async function roleNamed(client: HttpClient, name: string): Promise<Role | undefined> {
  return (await client.get(`${ROLES_PATH}/${encodeURIComponent(name)}`)).optionalJson<Role>();
}
