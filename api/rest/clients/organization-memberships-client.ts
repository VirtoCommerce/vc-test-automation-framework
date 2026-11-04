import type { HttpClient } from "../../http/http-client";
import type { LockMembershipRequest, OrganizationMembership, OrganizationMembershipData } from "../types/memberships";

import { optionalFields } from "@core/required-fields";

import { ORGANIZATION_MEMBERSHIP } from "../types/memberships";

const MEMBERSHIPS_PATH = "/api/customer/organization-memberships";

export class OrganizationMembershipsClient {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  /** Finds a membership; `undefined` when missing (the platform answers 404, not 200 with `null`). */
  async find(userId: string, organizationId: string): Promise<OrganizationMembership | undefined> {
    const path = `${MEMBERSHIPS_PATH}/user/${encodeURIComponent(userId)}/org/${encodeURIComponent(organizationId)}`;
    const response = await this.#httpClient.get(path);
    const membership = response.optionalJson<OrganizationMembershipData>({ allow404: true });
    return optionalFields(
      membership,
      ORGANIZATION_MEMBERSHIP.fields,
      `Membership of "${userId}" in "${organizationId}"`,
    );
  }

  async create(membership: OrganizationMembershipData): Promise<OrganizationMembership> {
    const response = await this.#httpClient.post(MEMBERSHIPS_PATH, { json: membership });
    return response.record(ORGANIZATION_MEMBERSHIP);
  }

  async lock(id: string, lockoutEnd?: Date): Promise<OrganizationMembership> {
    const path = `${MEMBERSHIPS_PATH}/${encodeURIComponent(id)}/lock`;
    const request: LockMembershipRequest = lockoutEnd === undefined ? {} : { lockoutEnd: lockoutEnd.toISOString() };
    const response = await this.#httpClient.post(path, { json: request });
    return response.record(ORGANIZATION_MEMBERSHIP);
  }

  async delete(ids: readonly string[]): Promise<void> {
    (await this.#httpClient.delete(MEMBERSHIPS_PATH, { query: { ids } })).expectOk();
  }
}
