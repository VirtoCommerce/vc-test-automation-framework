import type { ApiSession } from "@api/api-session";
import type { Credentials } from "@api/auth/credentials";
import type { MemberAddressFragment } from "@api/graphql/generated/graphql";
import type { Member, MemberData } from "@api/rest/types/customers";
import type { OrganizationMembership } from "@api/rest/types/memberships";
import type { CleanupStack } from "@core/cleanup-stack";
import type { MemberAddressDraft } from "../builders/address";
import type { Dataset } from "../dataset";
import type { StoreUnderTest } from "../store-under-test";
import type { ArrangeContext } from "./context";
import type { SecurityArrange } from "./security";

import { GetOrganizationsDocument, UpdateMemberAddressesDocument } from "@api/graphql/generated/graphql";
import { INDEX_LAG_TIMEOUT_MS, pollUntil } from "@core/poll";
import { requireDefined, requireFields } from "@core/required-fields";

import { newContact, newCustomerUser, newOrganization } from "../builders/customer";
import { expectSucceeded, SEARCH_PAGE_SIZE } from "./context";

const DEFAULT_ROLE = "role-org-employee";

/** Signed-in customer: a contact with a user in an organization, plus the user's membership. */
export interface CustomerAccount {
  /** The customer's signed-in session; pass it as `shopper` to cart, list and address methods. */
  readonly api: ApiSession;
  readonly credentials: Credentials;
  readonly userId: string;
  readonly contactId: string;
  readonly organizationId: string;
  /** Membership in `organizationId`, for locking or unlocking it. */
  readonly membership: OrganizationMembership;
}

/** Member address as xAPI returns it, with a guaranteed id and description. */
export type SavedAddress = MemberAddressFragment & { readonly id: string; readonly description: string };

/** Arranges organizations, contacts, signed-in frontend customers, their memberships and member addresses. */
export class CustomerArrange {
  readonly #admin: ApiSession;
  readonly #cleanup: CleanupStack;
  readonly #dataset: Dataset;
  readonly #store: StoreUnderTest;
  readonly #security: SecurityArrange;

  constructor({ admin, cleanup, dataset, store }: ArrangeContext, security: SecurityArrange) {
    this.#admin = admin;
    this.#cleanup = cleanup;
    this.#dataset = dataset;
    this.#store = store;
    this.#security = security;
  }

  /**
   * Creates an organization and deletes it after the test.
   *
   * @param name - Unique by default; pass one when the test searches for it.
   * @returns The organization id.
   */
  async organization(name?: string): Promise<string> {
    const { organizations } = this.#admin.rest.customers;
    const organization = name === undefined ? newOrganization() : newOrganization(name);
    this.#cleanup.push(`delete organization ${organization.name}`, () => organizations.delete([organization.id]));
    await organizations.create(organization);
    return organization.id;
  }

  /**
   * Creates members of any type through the generic members endpoint and deletes them after the test.
   * Prefer {@link CustomerArrange#organization} or {@link CustomerArrange#customerAccount} for the common cases.
   *
   * @param drafts - Members with their ids and member types set up front.
   * @returns The created members, in draft order.
   */
  async members<Data extends MemberData & { readonly id: string }>(
    drafts: readonly Data[],
  ): Promise<Member<MemberData>[]> {
    const { members } = this.#admin.rest.customers;
    const ids = drafts.map(({ id }) => id);
    this.#cleanup.push(`delete members ${ids.join(", ")}`, () => members.delete(ids));
    await members.createMany(drafts);
    const created = await members.getMany(ids);
    return ids.map((id) =>
      requireFields(
        created.find((member) => member.id === id),
        ["id"],
        `Member ${id}`,
      ),
    );
  }

  /**
   * Creates one member of any type and deletes it after the test; see {@link CustomerArrange#members}.
   *
   * @param draft - A member with its id and member type set up front.
   */
  async member<Data extends MemberData & { readonly id: string }>(draft: Data): Promise<Member<MemberData>> {
    const [created] = await this.members([draft]);
    return requireFields(created, ["id"], `Member ${draft.id}`);
  }

  /**
   * Creates a frontend customer (organization, contact, user with a dataset role, membership), signs them in,
   * and removes it all after the test. Use {@link SecurityArrange#platformUser} for a back-office user instead.
   *
   * @param options.role - Dataset role id; `role-org-employee` by default.
   * @param options.organizationId - Existing organization to join instead of creating one.
   */
  async customerAccount(
    options: { readonly role?: string; readonly organizationId?: string } = {},
  ): Promise<CustomerAccount> {
    const organizationId = options.organizationId ?? (await this.organization());
    const { contacts } = this.#admin.rest.customers;
    const contact = newContact(organizationId);
    this.#cleanup.push(`delete contact ${contact.name}`, () => contacts.delete([contact.id]));
    await contacts.create(contact);

    const roleId = options.role ?? DEFAULT_ROLE;
    const role = requireFields(this.#dataset.roles.get(roleId), ["name"], `Dataset role "${roleId}"`);
    const user = newCustomerUser(this.#store.id, contact.id, [{ id: roleId, name: role.name }]);
    const { users } = this.#admin.rest;
    this.#cleanup.push(`delete user ${user.userName}`, () => users.delete([user.userName]));
    expectSucceeded(
      await users.create({ ...user, password: user.password.reveal() }),
      `Creating user ${user.userName}`,
    );
    const { id: userId } = await users.get(user.userName);

    const membership = await this.#membership(userId, organizationId, roleId);
    const credentials = { username: user.userName, password: user.password };
    const api = await this.#security.signIn(credentials);
    return { api, credentials, userId, contactId: contact.id, organizationId, membership };
  }

  /**
   * Adds the customer to one more organization with the `role-org-employee` role; the membership is deleted after
   * the test. Does not wait for search; use {@link CustomerArrange#searchableMemberships} when the test searches.
   *
   * @returns The membership, for locking it.
   */
  async membership(account: CustomerAccount, organizationId: string): Promise<OrganizationMembership> {
    const { contacts } = this.#admin.rest.customers;
    const contact = await contacts.get(account.contactId);
    await contacts.update({ ...contact, organizations: [...(contact.organizations ?? []), organizationId] });
    return this.#membership(account.userId, organizationId, DEFAULT_ROLE);
  }

  /**
   * Creates organizations with the given names, adds the customer to each, and waits until the customer's
   * organization search finds them all (the index lags). Everything is removed after the test.
   *
   * @throws Error when an organization is not searchable within 60 s.
   */
  async searchableMemberships(account: CustomerAccount, names: readonly string[]): Promise<void> {
    for (const name of names) {
      await this.membership(account, await this.organization(name));
    }
    for (const name of names) {
      await pollUntil(
        async () => {
          const { me } = await account.api.graphql.execute(GetOrganizationsDocument, {
            searchPhrase: name,
            first: SEARCH_PAGE_SIZE,
          });
          return me?.contact?.organizations?.items?.map((organization) => organization?.name) ?? [];
        },
        (found) => found.includes(name),
        {
          describe: `organization ${name} to be searchable by ${account.credentials.username}`,
          timeoutMs: INDEX_LAG_TIMEOUT_MS,
        },
      );
    }
  }

  /**
   * Locks the customer's memberships and waits until the customer sees each organization as locked, so a sign-in
   * or query that follows meets the locks. Nothing to undo: memberships are removed with the customer. Locking
   * revokes the customer's sessions; `account.api` signs in again by itself.
   *
   * @throws Error when an organization is not shown as locked within 60 s.
   */
  async lockMemberships(account: CustomerAccount, memberships: readonly OrganizationMembership[]): Promise<void> {
    for (const { id } of memberships) {
      await this.#admin.rest.organizationMemberships.lock(id);
    }
    const organizationIds = memberships.map(({ organizationId }) => organizationId);
    await pollUntil(
      async () => {
        const { me } = await account.api.graphql.execute(GetOrganizationsDocument, { first: SEARCH_PAGE_SIZE });
        return (me?.contact?.organizations?.items ?? []).flatMap((organization) =>
          organization?.isLockedForCurrentUser === true ? [organization.id] : [],
        );
      },
      (locked) => organizationIds.every((id) => locked.includes(id)),
      {
        describe: `${account.credentials.username} to be locked in ${organizationIds.join(", ")}`,
        timeoutMs: INDEX_LAG_TIMEOUT_MS,
      },
    );
  }

  /**
   * Deletes a user and its contact after the test, if the user exists then; for accounts the code under test
   * creates, such as a frontend sign-up.
   */
  deleteAccountLater(userName: string): void {
    const { users, customers } = this.#admin.rest;
    this.#cleanup.push(`delete account ${userName} and its contact`, async () => {
      const user = await users.find(userName);
      if (user === undefined) {
        return;
      }
      await users.delete([userName]);
      if (user.memberId) {
        await customers.contacts.delete([user.memberId]);
      }
    });
  }

  /** Deletes an organization by id after the test, for organizations the code under test creates. */
  deleteOrganizationLater(organizationId: string): void {
    this.#cleanup.push(`delete organization ${organizationId}`, () =>
      this.#admin.rest.customers.organizations.delete([organizationId]),
    );
  }

  /**
   * Saves addresses of a contact or organization through xAPI in the shopper's session, as the frontend does.
   * Registers no cleanup: the addresses go away with their member.
   *
   * @param shopper - Session of a user allowed to change the member.
   * @param drafts - Each with a unique description, which is used to find it after saving.
   * @returns The saved addresses, in draft order.
   */
  async memberAddresses(
    shopper: ApiSession,
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

  /**
   * Saves one address of a contact or organization; see {@link CustomerArrange#memberAddresses}.
   *
   * @param shopper - Session of a user allowed to change the member.
   * @param draft - With a unique description.
   */
  async memberAddress(shopper: ApiSession, memberId: string, draft: MemberAddressDraft): Promise<SavedAddress> {
    const [saved] = await this.memberAddresses(shopper, memberId, [draft]);
    return requireFields(saved, ["id", "description"], `Saved address ${draft.description}`);
  }

  async #membership(userId: string, organizationId: string, roleId: string): Promise<OrganizationMembership> {
    const memberships = this.#admin.rest.organizationMemberships;
    const membership =
      (await memberships.find(userId, organizationId)) ??
      (await memberships.create({ userId, organizationId, roles: [{ roleId }] }));
    this.#cleanup.push(`delete membership of ${userId} in ${organizationId}`, () =>
      memberships.delete([membership.id]),
    );
    return membership;
  }
}
