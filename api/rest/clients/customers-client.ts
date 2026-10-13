import type { HttpClient } from "../../http/http-client";
import type {
  ContactData,
  CustomerAddress,
  EmployeeData,
  Member,
  MemberBaseData,
  MemberData,
  MembersSearchCriteria,
  OrganizationData,
  VendorData,
  VendorSearchResult,
} from "../types/customers";

import { optionalFields, requireFields, requireFieldsOfEach } from "@core/required-fields";

import { MEMBER_FIELDS } from "../types/customers";

const MEMBERS_PATH = "/api/members";
const CONTACTS_PATH = "/api/contacts";
const ORGANIZATIONS_PATH = "/api/organizations";
const EMPLOYEES_PATH = "/api/employees";
const VENDORS_PATH = "/api/vendors";
const ADDRESSES_PATH = "/api/addresses";

export class MemberResource<Data extends MemberBaseData> {
  readonly #httpClient: HttpClient;
  readonly #path: string;
  readonly #label: string;

  constructor(httpClient: HttpClient, path: string, label: string) {
    this.#httpClient = httpClient;
    this.#path = path;
    this.#label = label;
  }

  async get(id: string): Promise<Member<Data>> {
    return requireFields(await this.find(id), MEMBER_FIELDS, `${this.#label} "${id}"`);
  }

  async find(id: string): Promise<Member<Data> | undefined> {
    const response = await this.#httpClient.get(`${this.#path}/${encodeURIComponent(id)}`);
    return optionalFields(response.optionalJson<Data>(), MEMBER_FIELDS, `${this.#label} "${id}"`);
  }

  async getMany(ids: readonly string[]): Promise<Member<Data>[]> {
    const response = await this.#httpClient.get(this.#path, { query: { ids } });
    return requireFieldsOfEach(response.json<Data[]>(), MEMBER_FIELDS, this.#label);
  }

  async create(member: Data): Promise<Member<Data>> {
    const response = await this.#httpClient.post(this.#path, { json: member });
    return requireFields(response.json<Data>(), MEMBER_FIELDS, `Created ${this.#label}`);
  }

  async createMany(members: readonly Data[]): Promise<void> {
    (await this.#httpClient.post(`${this.#path}/bulk`, { json: members })).expectOk();
  }

  async update(member: Data): Promise<void> {
    (await this.#httpClient.put(this.#path, { json: member })).expectOk();
  }

  async updateMany(members: readonly Data[]): Promise<void> {
    (await this.#httpClient.put(`${this.#path}/bulk`, { json: members })).expectOk();
  }

  async search(criteria: MembersSearchCriteria): Promise<Member<Data>[]> {
    const response = await this.#httpClient.post(`${this.#path}/search`, { json: criteria });
    const { results } = response.json<{ results?: Data[] | null }>();
    return requireFieldsOfEach(results, MEMBER_FIELDS, `Found ${this.#label}`);
  }

  async delete(ids: readonly string[]): Promise<void> {
    (await this.#httpClient.delete(this.#path, { query: { ids } })).expectOk();
  }
}

class EmployeesResource {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async create(employee: EmployeeData): Promise<Member<EmployeeData>> {
    const response = await this.#httpClient.post(EMPLOYEES_PATH, { json: employee });
    return requireFields(response.json<EmployeeData>(), MEMBER_FIELDS, "Created employee");
  }

  async getMany(ids: readonly string[]): Promise<Member<EmployeeData>[]> {
    const response = await this.#httpClient.get(EMPLOYEES_PATH, { query: { ids } });
    return requireFieldsOfEach(response.json<EmployeeData[]>(), MEMBER_FIELDS, "Employee");
  }

  async createMany(employees: readonly EmployeeData[]): Promise<void> {
    (await this.#httpClient.post(`${EMPLOYEES_PATH}/bulk`, { json: employees })).expectOk();
  }
}

class VendorsResource {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async search(criteria: MembersSearchCriteria): Promise<Member<VendorData>[]> {
    const response = await this.#httpClient.post(`${VENDORS_PATH}/search`, { json: criteria });
    const { results } = response.json<VendorSearchResult>();
    return requireFieldsOfEach(results, MEMBER_FIELDS, "Found vendor");
  }
}

export class CustomersClient {
  readonly contacts: MemberResource<ContactData>;
  readonly organizations: MemberResource<OrganizationData>;
  readonly members: MemberResource<MemberData>;
  readonly employees: EmployeesResource;
  readonly vendors: VendorsResource;
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
    this.contacts = new MemberResource(httpClient, CONTACTS_PATH, "Contact");
    this.organizations = new MemberResource(httpClient, ORGANIZATIONS_PATH, "Organization");
    this.members = new MemberResource(httpClient, MEMBERS_PATH, "Member");
    this.employees = new EmployeesResource(httpClient);
    this.vendors = new VendorsResource(httpClient);
  }

  async listOrganizationsOf(memberId: string): Promise<Member<OrganizationData>[]> {
    const response = await this.#httpClient.get(`${MEMBERS_PATH}/${encodeURIComponent(memberId)}/organizations`);
    return requireFieldsOfEach(response.json<OrganizationData[]>(), MEMBER_FIELDS, `Organization of "${memberId}"`);
  }

  async listOrganizations(): Promise<Member<OrganizationData>[]> {
    const response = await this.#httpClient.get(`${MEMBERS_PATH}/organizations`);
    return requireFieldsOfEach(response.json<OrganizationData[]>(), MEMBER_FIELDS, "Organization");
  }

  /**
   * Deletes the members with the given ids. Ids are required, because the endpoint deletes every member matching the
   * criteria, and empty criteria match every member on the platform.
   *
   * @throws Error when `objectIds` is empty.
   */
  async deleteMatchingMembers(
    criteria: MembersSearchCriteria & { readonly objectIds: readonly string[] },
  ): Promise<void> {
    if (criteria.objectIds.length === 0) {
      throw new Error("Deleting members by criteria needs at least one id in objectIds");
    }
    (await this.#httpClient.post(`${MEMBERS_PATH}/delete`, { json: criteria })).expectOk();
  }

  async updateAddresses(memberId: string, addresses: readonly CustomerAddress[]): Promise<void> {
    (await this.#httpClient.put(ADDRESSES_PATH, { query: { memberId }, json: addresses })).expectOk();
  }
}
