import type { HttpClient } from "../../http/http-client";
import type { LockMembershipRequest, OrganizationMembership, OrganizationMembershipData } from "../types/memberships";

import { optionalFields, requireFields } from "@core/required-fields";

import { ORGANIZATION_MEMBERSHIP_FIELDS } from "../types/memberships";

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
      ORGANIZATION_MEMBERSHIP_FIELDS,
      `Membership of "${userId}" in "${organizationId}"`,
    );
  }

  async create(membership: OrganizationMembershipData): Promise<OrganizationMembership> {
    const response = await this.#httpClient.post(MEMBERSHIPS_PATH, { json: membership });
    return requireFields(
      response.json<OrganizationMembershipData>(),
      ORGANIZATION_MEMBERSHIP_FIELDS,
      "Created membership",
    );
  }

  async lock(id: string, lockoutEnd?: Date): Promise<OrganizationMembership> {
    const path = `${MEMBERSHIPS_PATH}/${encodeURIComponent(id)}/lock`;
    const request: LockMembershipRequest = lockoutEnd === undefined ? {} : { lockoutEnd: lockoutEnd.toISOString() };
    const response = await this.#httpClient.post(path, { json: request });
    return requireFields(
      response.json<OrganizationMembershipData>(),
      ORGANIZATION_MEMBERSHIP_FIELDS,
      `Locked membership "${id}"`,
    );
  }

  async delete(ids: readonly string[]): Promise<void> {
    (await this.#httpClient.delete(MEMBERSHIPS_PATH, { query: { ids } })).expectOk();
  }
}
