import type { HttpClient } from "../../http/http-client";
import type {
  Permission,
  Role,
  RoleData,
  RoleSearchCriteria,
  RoleSearchResult,
  SecurityResult,
} from "../types/security";

import { requireFields, requireFieldsOfEach } from "@core/required-fields";

import { ROLE } from "../types/security";

const SECURITY_PATH = "/api/platform/security";
const ROLES_PATH = `${SECURITY_PATH}/roles`;
const PERMISSIONS_PATH = `${SECURITY_PATH}/permissions`;

class PermissionsResource {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async list(): Promise<Permission[]> {
    return (await this.#httpClient.get(PERMISSIONS_PATH)).json<Permission[]>();
  }
}

export class RolesClient {
  readonly permissions: PermissionsResource;
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
    this.permissions = new PermissionsResource(httpClient);
  }

  /** Creates or updates a role. Returns 200 even when refused: check the result's `succeeded` and `errors`. */
  async save(role: RoleData): Promise<SecurityResult> {
    return (await this.#httpClient.put(ROLES_PATH, { json: role })).json<SecurityResult>();
  }

  async get(name: string): Promise<Role> {
    return requireFields(await this.find(name), ROLE.fields, `Role "${name}"`);
  }

  async find(name: string): Promise<Role | undefined> {
    const response = await this.#httpClient.get(`${ROLES_PATH}/${encodeURIComponent(name)}`);
    return response.optionalRecord(ROLE);
  }

  async search(criteria: RoleSearchCriteria): Promise<Role[]> {
    const response = await this.#httpClient.post(`${ROLES_PATH}/search`, { json: criteria });
    const { roles } = response.json<RoleSearchResult>();
    return requireFieldsOfEach(roles, ROLE.fields, "Found role");
  }

  async delete(ids: readonly string[]): Promise<void> {
    (await this.#httpClient.delete(ROLES_PATH, { query: { ids } })).expectOk();
  }
}
