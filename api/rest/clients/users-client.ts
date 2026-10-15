import type { HttpClient } from "../../http/http-client";
import type {
  ApplicationUser,
  ApplicationUserData,
  IdentityResult,
  SecurityResult,
  UserApiKey,
  UserApiKeyData,
  UserDetail,
  UserSearchCriteria,
  UserSearchResult,
} from "../types/security";

import { requireFields, requireFieldsOfEach } from "@core/required-fields";
import { Secret } from "@core/secret";

import { APPLICATION_USER, USER_API_KEY, USER_DETAIL } from "../types/security";

const SECURITY_PATH = "/api/platform/security";
const USERS_PATH = `${SECURITY_PATH}/users`;
const API_KEYS_PATH = `${USERS_PATH}/apikeys`;

class ApiKeysResource {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async list(userId: string): Promise<UserApiKey[]> {
    const response = await this.#httpClient.get(`${USERS_PATH}/${encodeURIComponent(userId)}/apikeys`);
    return response.records(USER_API_KEY);
  }

  async create(apiKey: UserApiKeyData): Promise<void> {
    (await this.#httpClient.post(API_KEYS_PATH, { json: apiKey })).expectOk();
  }

  async update(apiKey: UserApiKeyData): Promise<void> {
    (await this.#httpClient.put(API_KEYS_PATH, { json: apiKey })).expectOk();
  }

  async delete(ids: readonly string[]): Promise<void> {
    (await this.#httpClient.delete(API_KEYS_PATH, { query: { ids } })).expectOk();
  }
}

/**
 * Platform users (`/api/platform/security/users`). Methods returning a `SecurityResult` get 200 even when refused:
 * check `succeeded` and `errors`. Passwords and reset tokens are {@link Secret}s, revealed only in request bodies.
 */
export class UsersClient {
  readonly apiKeys: ApiKeysResource;
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
    this.apiKeys = new ApiKeysResource(httpClient);
  }

  async create(user: ApplicationUserData): Promise<SecurityResult> {
    return (await this.#httpClient.post(`${USERS_PATH}/create`, { json: user })).json<SecurityResult>();
  }

  async get(userName: string): Promise<ApplicationUser> {
    return requireFields(await this.find(userName), APPLICATION_USER.fields, `User "${userName}"`);
  }

  async find(userName: string): Promise<ApplicationUser | undefined> {
    return this.#fetch(`${USERS_PATH}/${encodeURIComponent(userName)}`);
  }

  async getById(id: string): Promise<ApplicationUser> {
    const user = await this.#fetch(`${USERS_PATH}/id/${encodeURIComponent(id)}`);
    return requireFields(user, APPLICATION_USER.fields, `User "${id}"`);
  }

  async search(criteria: UserSearchCriteria): Promise<ApplicationUser[]> {
    const response = await this.#httpClient.post(`${USERS_PATH}/search`, { json: criteria });
    const { users } = response.json<UserSearchResult>();
    return requireFieldsOfEach(users, APPLICATION_USER.fields, "Found user");
  }

  async update(user: ApplicationUserData): Promise<SecurityResult> {
    return (await this.#httpClient.put(USERS_PATH, { json: user })).json<SecurityResult>();
  }

  async delete(userNames: readonly string[]): Promise<void> {
    (await this.#httpClient.delete(USERS_PATH, { query: { names: userNames } })).expectOk();
  }

  async lock(id: string): Promise<SecurityResult> {
    return (await this.#httpClient.post(`${USERS_PATH}/${encodeURIComponent(id)}/lock`)).json<SecurityResult>();
  }

  async unlock(id: string): Promise<SecurityResult> {
    return (await this.#httpClient.post(`${USERS_PATH}/${encodeURIComponent(id)}/unlock`)).json<SecurityResult>();
  }

  async changePassword(userName: string, oldPassword: Secret, newPassword: Secret): Promise<SecurityResult> {
    const path = `${USERS_PATH}/${encodeURIComponent(userName)}/changepassword`;
    const json = { oldPassword: oldPassword.reveal(), newPassword: newPassword.reveal() };
    return (await this.#httpClient.post(path, { json })).json<SecurityResult>();
  }

  async resetPassword(userName: string, newPassword: Secret): Promise<SecurityResult> {
    const path = `${USERS_PATH}/${encodeURIComponent(userName)}/resetpassword`;
    const json = { newPassword: newPassword.reveal(), forcePasswordChangeOnNextSignIn: false };
    return (await this.#httpClient.post(path, { json })).json<SecurityResult>();
  }

  async generatePasswordResetToken(id: string): Promise<Secret> {
    const path = `${USERS_PATH}/${encodeURIComponent(id)}/generatePasswordResetToken`;
    return new Secret((await this.#httpClient.get(path)).expectOk().text);
  }

  async confirmPasswordReset(id: string, token: Secret, newPassword: Secret): Promise<SecurityResult> {
    const path = `${USERS_PATH}/${encodeURIComponent(id)}/resetpasswordconfirm`;
    const json = { token: token.reveal(), newPassword: newPassword.reveal() };
    return (await this.#httpClient.post(path, { json })).json<SecurityResult>();
  }

  async validatePassword(password: Secret): Promise<IdentityResult> {
    const path = `${SECURITY_PATH}/validatepassword`;
    return (await this.#httpClient.post(path, { json: password.reveal() })).json<IdentityResult>();
  }

  async sendVerificationEmail(id: string): Promise<void> {
    (await this.#httpClient.post(`${USERS_PATH}/${encodeURIComponent(id)}/sendVerificationEmail`)).expectOk();
  }

  async getCurrent(): Promise<UserDetail> {
    const response = await this.#httpClient.get(`${SECURITY_PATH}/currentuser`);
    return response.record(USER_DETAIL);
  }

  async #fetch(path: string): Promise<ApplicationUser | undefined> {
    const response = await this.#httpClient.get(path);
    return response.optionalRecord(APPLICATION_USER);
  }
}
