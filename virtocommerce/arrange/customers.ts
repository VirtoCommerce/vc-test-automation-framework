import type { Credentials } from "@virtocommerce/test-automation-framework/auth";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";
import type { MemberAddressDraft } from "../builders/address.ts";
import type { MemberDraft } from "../builders/customer.ts";
import type { MemberAddressFragment } from "../graphql/generated/graphql.ts";
import type {
  VirtoCommerceCustomerModuleCoreModelContact as Contact,
  VirtoCommerceCustomerModuleCoreModelMember as Member,
  VirtoCommerceCustomerModuleCoreModelOrganization as Organization,
  VirtoCommerceCustomerModuleCoreModelOrganizationMembership as OrganizationMembership,
} from "../rest/generated/platform.ts";
import type { WithRequired } from "../support/require-fields.ts";
import type { CartsArrange } from "./carts.ts";
import type { ArrangeContext } from "./context.ts";
import type { Shopper } from "./shopper.ts";

import { randomUUID } from "node:crypto";

import { newPassword } from "../builders/security.ts";
import { dataset } from "../dataset/index.ts";
import { GetOrganizationsDocument, UpdateMemberAddressesDocument } from "../graphql/generated/graphql.ts";
import { INDEX_LAG_TIMEOUT_MS, pollUntil } from "../support/poll.ts";
import { requireDefined, requireFields } from "../support/require-fields.ts";
import { uniqueId } from "../support/unique-id.ts";
import { userNamed } from "../support/users.ts";
import { signedInShopper } from "./shopper.ts";

/** A frontend customer created for one test, signed in on the API. */
export interface Customer extends Shopper {
  readonly credentials: Credentials;
  readonly contactId: string;
  readonly organizationId: string;
  /** The membership of the customer in their organization. */
  readonly membershipId: string;
}

/** The options of {@link CustomersArrange#customer}. */
export interface CustomerOptions {
  /** The organization role of the customer, `role-org-employee` by default. */
  readonly role?: string;
  /** An organization to join, such as another customer's; a new one by default. */
  readonly organizationId?: string;
}

/** A member as the platform saved it. */
export type ArrangedMember = WithRequired<Member, "id" | "name" | "memberType">;

/** A member address as xAPI saved it. */
export type SavedAddress = WithRequired<MemberAddressFragment, "id" | "description">;

/** Arranges organizations, contacts, frontend customers and their addresses. */
export interface CustomersArrange {
  /**
   * Creates a frontend customer: a contact in an approved organization, a user of the store with an organization
   * role, and the user's membership in the organization. After the test, the customer's default cart is removed, the
   * customer is signed out, and the parts are deleted.
   *
   * @throws {HttpError} The platform refuses a part.
   */
  customer(options?: CustomerOptions): Promise<Customer>;
  /**
   * Creates an approved organization and deletes it after the test.
   *
   * @param name - A unique name by default.
   * @returns The identifier of the organization.
   */
  organization(name?: string): Promise<string>;
  /**
   * Adds a customer to another organization, as an employee, and removes the membership after the test.
   *
   * @returns The identifier of the membership.
   */
  membership(customer: Customer, organizationId: string): Promise<string>;
  /** Adds a customer to new organizations with the given names, and waits until the customer finds them by name. */
  searchableMemberships(customer: Customer, names: readonly string[]): Promise<void>;
  /** Saves addresses of a contact or an organization as the shopper; they are deleted with the member. */
  memberAddresses(shopper: Shopper, memberId: string, drafts: readonly MemberAddressDraft[]): Promise<SavedAddress[]>;
  /** Saves an address of a contact or an organization as the shopper; it is deleted with the member. */
  memberAddress(shopper: Shopper, memberId: string, draft: MemberAddressDraft): Promise<SavedAddress>;
  /**
   * Signs a user in as a shopper, such as a user that the code under test registers, and signs them out after the
   * test. Their default cart is removed after the test.
   */
  signedIn(credentials: Credentials): Promise<Shopper>;
  /** Deletes a user and their contact after the test, such as a user that the code under test registers. */
  deleteAccountLater(userName: string): void;
  /** Deletes an organization after the test, such as one that the code under test registers. */
  deleteOrganizationLater(organizationId: string): void;
  /**
   * Creates members of any type, such as contacts, organizations, employees and vendors, in one request, and deletes
   * them after the test.
   *
   * @returns The members as the platform saved them, in the order of the drafts.
   */
  members(drafts: readonly MemberDraft[]): Promise<ArrangedMember[]>;
  /** Creates a member as {@link CustomersArrange#members} does. */
  member(draft: MemberDraft): Promise<ArrangedMember>;
  /** Deletes members of any type after the test, such as members that the code under test creates. */
  deleteMembersLater(ids: readonly string[]): void;
  /**
   * Locks memberships of a customer, until they are deleted, and waits until xAPI reports the customer locked in
   * those organizations.
   */
  lockMemberships(customer: Customer, membershipIds: readonly string[]): Promise<void>;
}

const CUSTOMER_ROLE = "role-org-employee";
const MEMBERS_PATH = "/api/members";
const CONTACTS_PATH = "/api/contacts";
const MEMBERSHIPS_PATH = "/api/customer/organization-memberships";
const USERS_PATH = "/api/platform/security/users";
const SEARCH_PAGE_SIZE = 100;

/**
 * Returns the customer methods of `arrange`.
 *
 * @param context - What the methods create and remove data with.
 * @param carts - The cart methods, for removing the default cart of a customer.
 * @returns The methods.
 */
export function customersArrange(context: ArrangeContext, carts: CartsArrange): CustomersArrange {
  const { admin, signIn, signOut, store, later } = context;

  async function customer({ role = CUSTOMER_ROLE, organizationId }: CustomerOptions = {}): Promise<Customer> {
    const client = await admin();
    const organization = organizationId ?? (await createOrganization());
    const suffix = randomUUID();

    const contact = {
      id: randomUUID(),
      memberType: "Contact",
      firstName: "Test",
      lastName: "Customer",
      name: `test-customer-${suffix}`,
      status: "Approved",
      organizations: [organization],
      defaultOrganizationId: organization,
    } satisfies Contact;
    (await client.post(CONTACTS_PATH, { json: contact })).expectOk();
    later(`delete contact ${contact.name}`, () => deleteMembers(client, [contact.id]));

    const credentials: Credentials = {
      username: `test-customer-${suffix}@example.com`,
      password: newPassword(),
      storeId: store.id,
    };
    await createUser(client, credentials, contact.id, role);
    later(`delete user ${credentials.username}`, async () => {
      await signOut(credentials);
      (await client.delete(USERS_PATH, { query: { names: [credentials.username] } })).expectOk();
    });

    const userId = requireFields(
      await userNamed(client, credentials.username),
      ["id"],
      `The user ${credentials.username}`,
    ).id;
    const membershipId = await membershipOf(client, userId, organization, role);

    const shopper = await signedInShopper(signIn, store, credentials);
    carts.removeDefaultCartLater(shopper);
    return { ...shopper, credentials, contactId: contact.id, organizationId: organization, membershipId };
  }

  async function createOrganization(name = uniqueId("test-organization")): Promise<string> {
    const client = await admin();
    const draft = { id: randomUUID(), memberType: "Organization", name, status: "Approved" } satisfies Organization;
    (await client.post("/api/organizations", { json: draft })).expectOk();
    later(`delete organization ${draft.name}`, () => deleteMembers(client, [draft.id]));
    return draft.id;
  }

  async function membership(member: Customer, organizationId: string): Promise<string> {
    const client = await admin();
    const contact = (await client.get(`${CONTACTS_PATH}/${encodeURIComponent(member.contactId)}`)).json<Contact>();
    const organizations = [...(contact.organizations ?? []), organizationId];
    (await client.put(CONTACTS_PATH, { json: { ...contact, organizations } })).expectOk();
    return membershipOf(client, member.userId, organizationId, CUSTOMER_ROLE);
  }

  async function searchableMemberships(member: Customer, names: readonly string[]): Promise<void> {
    for (const name of names) {
      await membership(member, await createOrganization(name));
    }
    for (const name of names) {
      await pollUntil(
        async () => {
          const { me } = await member.graphql.execute(GetOrganizationsDocument, {
            searchPhrase: name,
            first: SEARCH_PAGE_SIZE,
          });
          return me?.contact?.organizations?.items?.map((organization) => organization?.name) ?? [];
        },
        (found) => found.includes(name),
        `organization ${name} to be searchable by ${member.credentials.username}`,
        INDEX_LAG_TIMEOUT_MS,
      );
    }
  }

  async function memberAddresses(
    shopper: Shopper,
    memberId: string,
    drafts: readonly MemberAddressDraft[],
  ): Promise<SavedAddress[]> {
    const { updateMemberAddresses } = await shopper.graphql.execute(UpdateMemberAddressesDocument, {
      command: { memberId, addresses: [...drafts] },
    });
    const saved = requireDefined(updateMemberAddresses?.addresses?.items, `Addresses of ${memberId}`);
    return drafts.map((draft) =>
      requireFields(
        saved.find((address) => address.description === draft.description),
        ["id", "description"],
        `Saved address ${draft.description}`,
      ),
    );
  }

  async function memberAddress(shopper: Shopper, memberId: string, draft: MemberAddressDraft): Promise<SavedAddress> {
    const [saved] = await memberAddresses(shopper, memberId, [draft]);
    return requireFields(saved, ["id", "description"], `Saved address ${draft.description}`);
  }

  async function signedIn(credentials: Credentials): Promise<Shopper> {
    const shopper = await signedInShopper(signIn, store, credentials);
    later(`sign ${credentials.username} out`, () => signOut(credentials));
    carts.removeDefaultCartLater(shopper);
    return shopper;
  }

  function deleteAccountLater(userName: string): void {
    later(`delete user ${userName} and their contact`, async () => {
      const client = await admin();
      const user = await userNamed(client, userName);
      if (user === undefined) {
        return;
      }
      (await client.delete(USERS_PATH, { query: { names: [userName] } })).expectOk();
      if (user.memberId) {
        await deleteMembers(client, [user.memberId]);
      }
    });
  }

  function deleteOrganizationLater(organizationId: string): void {
    later(`delete organization ${organizationId}`, async () => deleteMembers(await admin(), [organizationId]));
  }

  async function membershipOf(
    client: HttpClient,
    userId: string,
    organizationId: string,
    role: string,
  ): Promise<string> {
    const path = `${MEMBERSHIPS_PATH}/user/${encodeURIComponent(userId)}/org/${encodeURIComponent(organizationId)}`;
    const found =
      (await client.get(path)).optionalJson<OrganizationMembership>({ allow404: true }) ??
      (await client.post(MEMBERSHIPS_PATH, { json: { userId, organizationId, roles: [{ roleId: role }] } }))
        .expectOk()
        .json<OrganizationMembership>();
    const { id } = requireFields(found, ["id"], `The membership of ${userId} in ${organizationId}`);
    later(`delete the membership of ${userId} in ${organizationId}`, async () =>
      (await client.delete(MEMBERSHIPS_PATH, { query: { ids: [id] } })).expectOk(),
    );
    return id;
  }

  async function members(drafts: readonly MemberDraft[]): Promise<ArrangedMember[]> {
    const client = await admin();
    const ids = drafts.map(({ id }) => id);
    (await client.post(`${MEMBERS_PATH}/bulk`, { json: drafts })).expectOk();
    later(`delete members ${ids.join(", ")}`, () => deleteMembers(client, ids));
    const created = (await client.get(MEMBERS_PATH, { query: { ids } })).expectOk().json<Member[]>();
    return ids.map((id) =>
      requireFields(
        created.find((found) => found.id === id),
        ["id", "name", "memberType"],
        `Member ${id}`,
      ),
    );
  }

  function deleteMembersLater(ids: readonly string[]): void {
    later(`delete members ${ids.join(", ")}`, async () => deleteMembers(await admin(), ids));
  }

  async function member(draft: MemberDraft): Promise<ArrangedMember> {
    const [created] = await members([draft]);
    return requireFields(created, ["id", "name", "memberType"], `Member ${draft.id}`);
  }

  async function lockMemberships(member: Customer, membershipIds: readonly string[]): Promise<void> {
    const client = await admin();
    const organizationIds: string[] = [];
    for (const id of membershipIds) {
      const locked = (await client.post(`${MEMBERSHIPS_PATH}/${encodeURIComponent(id)}/lock`, { json: {} }))
        .expectOk()
        .json<OrganizationMembership>();
      organizationIds.push(requireFields(locked, ["organizationId"], `Membership ${id}`).organizationId);
    }
    await pollUntil(
      async () => {
        const { me } = await member.graphql.execute(GetOrganizationsDocument, { first: SEARCH_PAGE_SIZE });
        return (me?.contact?.organizations?.items ?? []).flatMap((organization) =>
          organization?.isLockedForCurrentUser === true ? [organization.id] : [],
        );
      },
      (locked) => organizationIds.every((id) => locked.includes(id)),
      `${member.credentials.username} to be locked in ${organizationIds.join(", ")}`,
      INDEX_LAG_TIMEOUT_MS,
    );
  }

  return {
    customer,
    organization: createOrganization,
    membership,
    searchableMemberships,
    memberAddresses,
    memberAddress,
    signedIn,
    deleteAccountLater,
    deleteOrganizationLater,
    lockMemberships,
    members,
    member,
    deleteMembersLater,
  };
}

async function createUser(
  client: HttpClient,
  credentials: Credentials,
  memberId: string,
  roleId: string,
): Promise<void> {
  const role = dataset.roles.get(roleId);
  const result = (
    await client.post(`${USERS_PATH}/create`, {
      json: {
        userName: credentials.username,
        email: credentials.username,
        password: credentials.password,
        userType: "Customer",
        storeId: credentials.storeId,
        memberId,
        status: "Approved",
        emailConfirmed: true,
        roles: [{ id: role.id, name: role.name }],
      },
    })
  ).json<{ succeeded?: boolean; errors?: unknown }>();
  if (result.succeeded !== true) {
    throw new Error(`Creating the user ${credentials.username} failed: ${JSON.stringify(result.errors)}`);
  }
}

async function deleteMembers(client: HttpClient, ids: readonly string[]): Promise<void> {
  (await client.delete(MEMBERS_PATH, { query: { ids: [...ids] } })).expectOk();
}

/**
 * Returns the shopper as the customer that `shopperAs: "customer"` created, with their contact and organization.
 *
 * @param shopper - The `shopper` fixture.
 * @returns The customer.
 * @throws {Error} The shopper is not a customer created for the test.
 */
export function customerOf(shopper: Shopper): Customer {
  if (!("organizationId" in shopper) || !("membershipId" in shopper)) {
    throw new Error(
      `${shopper.credentials?.username ?? "The anonymous visitor"} is not a customer created for the test`,
    );
  }
  return shopper as Customer;
}
