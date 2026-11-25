import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Derives each role's permissions from the seed and compares them with `rolePermissions` in `.qa/project.json`, which
 * is copied by hand. For every key of `roles`, the account's permissions are those of the user's global roles (`roles`
 * in `dataset/data/users/`) plus the organization-scoped roles the Customer module (vc-module-customer) adds to the
 * token, mirrored from its source:
 * - the organization: `OrganizationIdClaimProvider.GetMemberOrganizationId` ->
 *   `OrganizationAccessResolver.ResolveOrganizationIdAsync`: the contact's `currentOrganizationId` if accessible, else
 *   its `defaultOrganizationId` if accessible, else the first accessible one (the seed sets no current organization).
 *   Accessible (`GetAccessibleOrganizationIdsAsync`) is one of the contact's `organizations` whose membership is not
 *   `IsCurrentlyLocked` and whose effective status is not `IsBlocking`. No accessible organization: no such roles.
 * - the roles: `OrganizationIdClaimProvider.GetOrgScopedRoleIdsAsync`: none when the membership there
 *   `IsCurrentlyLocked`, none when `ModuleConstants.MembershipStatuses.IsBlocking(effectiveStatus)`, none when there is
 *   no membership record and the contact's `organizations` lacks the organization; otherwise
 *   `OrganizationMembershipSearchService.GetRolesByUserAndOrgAsync`, the organization's own `roles` (in
 *   `dataset/data/organizations/`, typed `OrganizationRole[]` in `api/rest/generated/rest-api.ts`) merged with the
 *   membership's `roles` (`dataset/data/organization-memberships/`).
 * - `OrganizationMembership.IsCurrentlyLocked` is `IsLocked && (no LockoutEnd || LockoutEnd > now)`; neither field
 *   alone locks. `OrganizationMembership.ResolveEffectiveStatus(membershipStatus, memberStatus)` is the membership's
 *   `status` when not empty, else the contact's, else `Approved`. `IsBlocking` covers exactly `BlockingStatuses` =
 *   `Invited`, `Rejected`, `Deleted`, compared exactly. "Locked" is not a lifecycle status: it is a contact-list filter
 *   derived from `IsCurrentlyLocked` (xAPI `ResolveOrganizationStatusFilterQueryHandler`), so a contact whose `status`
 *   is "Locked" (the seed's `acme-store-employee-9`) is not blocked by it. These names and values were read in the
 *   module source through VirtoOZ (PlatformBackendSourceCode); nothing in this repository confirms them.
 * Every role is mapped through `dataset/data/roles/`. Not derived: permissions a sales representative gets for the
 * organizations assigned to them. An account that is a platform administrator (`isAdministrator`) holds every
 * permission and must be absent from `rolePermissions`. Every other role of `roles` must have an entry: an absent entry
 * is a failure here, though the facts reader allows one. Prints each difference and exits 1; exits 0 when the two
 * agree. Paths resolve from the repository root (the folder above this script), not the current folder.
 * Repository-only: it knows this repository's seed layout.
 */

type Json = Record<string, unknown>;

const ROOT = resolve(dirname(resolve(process.argv[1] ?? "")), "..");
const FACTS_PATH = join(ROOT, ".qa/project.json");
const DATA_DIR = join(ROOT, "dataset/data");
const APPROVED = "Approved";
const BLOCKING_STATUSES: readonly string[] = ["Invited", "Rejected", "Deleted"];
const OK = "facts:check: rolePermissions matches the seed";

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson(path: string): Json {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!isRecord(value)) {
    throw new Error(`${path} is not a JSON object`);
  }
  return value;
}

function readFolder(name: string): Json[] {
  const folder = join(DATA_DIR, name);
  let files: string[];
  try {
    files = readdirSync(folder).filter((file) => file.endsWith(".json"));
  } catch {
    return [];
  }
  return files.sort().map((file) => readJson(join(folder, file)));
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringMap(value: unknown, path: string): Record<string, string> {
  if (!isRecord(value)) {
    throw new Error(`${path} is not an object`);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      const account = text(item);
      if (account === undefined) {
        throw new Error(`${path}["${key}"] is not a non-empty string`);
      }
      return [key, account];
    }),
  );
}

function listMap(value: unknown, path: string): Record<string, string[]> {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    throw new Error(`${path} is not an object`);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, items]) => [key, list(items).map((item) => String(item))]),
  );
}

type RoleIndex = { byId: Map<string, string[]>; idByName: Map<string, string> };

function roleIndex(): RoleIndex {
  const byId = new Map<string, string[]>();
  const idByName = new Map<string, string>();
  for (const role of readFolder("roles")) {
    const id = text(role["id"]);
    if (id === undefined) {
      throw new Error(`a role in dataset/data/roles has no id`);
    }
    const permissions = list(role["permissions"]).flatMap((permission) =>
      isRecord(permission) ? (text(permission["name"]) ?? []) : (text(permission) ?? []),
    );
    byId.set(id, permissions);
    const name = text(role["name"]);
    if (name !== undefined) {
      idByName.set(name.toLowerCase(), id);
    }
  }
  return { byId, idByName };
}

/** The role id an entry names: `id`, `roleId`, `name`, `roleName`, or the entry itself when it is a string. */
function roleIdOf(entry: unknown, roles: RoleIndex, where: string): string {
  const id = isRecord(entry) ? (text(entry["id"]) ?? text(entry["roleId"])) : text(entry);
  if (id !== undefined && roles.byId.has(id)) {
    return id;
  }
  const name = isRecord(entry) ? (text(entry["name"]) ?? text(entry["roleName"])) : undefined;
  const byName = name === undefined ? undefined : roles.idByName.get(name.toLowerCase());
  if (byName !== undefined) {
    return byName;
  }
  throw new Error(`${where} names a role that is not in dataset/data/roles: ${JSON.stringify(entry)}`);
}

type Seed = { users: Json[]; memberships: Json[]; organizations: Json[]; contacts: Json[]; roles: RoleIndex };

/** The account's permissions, or `undefined` for a platform administrator. */
function effectivePermissions(account: string, seed: Seed): string[] | undefined {
  const lower = account.toLowerCase();
  const user = seed.users.find((candidate) =>
    [candidate["userName"], candidate["email"]].some((name) => text(name)?.toLowerCase() === lower),
  );
  if (user === undefined) {
    throw new Error(`no user in dataset/data/users signs in as ${account}`);
  }
  if (user["isAdministrator"] === true) {
    return undefined;
  }
  const userId = text(user["id"]);
  const roleIds = list(user["roles"]).map((entry) => roleIdOf(entry, seed.roles, `user ${account}`));
  const memberships = seed.memberships.filter((item) => userId !== undefined && item["userId"] === userId);
  const contact = seed.contacts.find((item) => text(item["id"]) === text(user["memberId"]));
  const membershipIn = (organizationId: string): Json | undefined =>
    memberships.find((item) => item["organizationId"] === organizationId);
  const signedInTo = resolveOrganizationId(contact, userId, membershipIn);
  if (signedInTo === undefined) {
    return permissionsOf(roleIds, seed.roles);
  }
  const membership = membershipIn(signedInTo);
  if (membership !== undefined && isCurrentlyLocked(membership)) {
    return permissionsOf(roleIds, seed.roles);
  }
  if (isBlocking(resolveEffectiveStatus(text(membership?.["status"]), text(contact?.["status"])))) {
    return permissionsOf(roleIds, seed.roles);
  }
  if (membership === undefined && !containsIgnoreCase(list(contact?.["organizations"]), signedInTo)) {
    return permissionsOf(roleIds, seed.roles);
  }
  const organization = seed.organizations.find((item) => text(item["id"]) === signedInTo);
  roleIds.push(
    ...list(organization?.["roles"]).map((entry) => roleIdOf(entry, seed.roles, `organization ${signedInTo}`)),
    ...list(membership?.["roles"]).map((entry) =>
      roleIdOf(entry, seed.roles, `membership of ${account} in ${signedInTo}`),
    ),
  );
  return permissionsOf(roleIds, seed.roles);
}

function permissionsOf(roleIds: readonly string[], roles: RoleIndex): string[] {
  return [...new Set(roleIds.flatMap((id) => roles.byId.get(id) ?? []))].sort();
}

function containsIgnoreCase(values: readonly unknown[], wanted: string): boolean {
  return values.some((value) => text(value)?.toLowerCase() === wanted.toLowerCase());
}

/** `OrganizationMembership.ResolveEffectiveStatus`: the membership's status, else the member's, else `Approved`. */
function resolveEffectiveStatus(membershipStatus: string | undefined, memberStatus: string | undefined): string {
  return membershipStatus ?? memberStatus ?? APPROVED;
}

/** `ModuleConstants.MembershipStatuses.IsBlocking`: one of `BlockingStatuses`, compared exactly. */
function isBlocking(effectiveStatus: string): boolean {
  return BLOCKING_STATUSES.includes(effectiveStatus);
}

/** `OrganizationMembership.IsCurrentlyLocked`: `IsLocked && (no LockoutEnd || LockoutEnd > now)`. */
function isCurrentlyLocked(membership: Json): boolean {
  const lockoutEnd = text(membership["lockoutEnd"]);
  return membership["isLocked"] === true && (lockoutEnd === undefined || Date.parse(lockoutEnd) > Date.now());
}

/**
 * `OrganizationAccessResolver.ResolveOrganizationIdAsync`: the contact's `currentOrganizationId` when accessible, else
 * its `defaultOrganizationId` when accessible, else the first accessible organization. Accessible
 * (`GetAccessibleOrganizationIdsAsync`) means one of the contact's `organizations` whose membership is not currently
 * locked and whose effective status is not blocking; with no user id, every one of them.
 */
function resolveOrganizationId(
  contact: Json | undefined,
  userId: string | undefined,
  membershipIn: (organizationId: string) => Json | undefined,
): string | undefined {
  if (contact === undefined) {
    return undefined;
  }
  const organizations = list(contact["organizations"]).flatMap((id) => text(id) ?? []);
  const accessible =
    userId === undefined
      ? organizations
      : organizations.filter((organizationId) => {
          const membership = membershipIn(organizationId);
          if (membership !== undefined && isCurrentlyLocked(membership)) {
            return false;
          }
          return !isBlocking(resolveEffectiveStatus(text(membership?.["status"]), text(contact["status"])));
        });
  for (const preferred of [text(contact["currentOrganizationId"]), text(contact["defaultOrganizationId"])]) {
    if (preferred !== undefined && containsIgnoreCase(accessible, preferred)) {
      return preferred;
    }
  }
  return accessible[0];
}

function differences(): string[] {
  const facts = readJson(FACTS_PATH);
  const roles = stringMap(facts["roles"], "roles");
  const listed = listMap(facts["rolePermissions"], "rolePermissions");
  const seed: Seed = {
    users: readFolder("users"),
    memberships: readFolder("organization-memberships"),
    organizations: readFolder("organizations"),
    contacts: readFolder("contacts"),
    roles: roleIndex(),
  };
  const found: string[] = [];
  for (const role of Object.keys(listed).filter((name) => !Object.hasOwn(roles, name))) {
    found.push(`rolePermissions["${role}"]: not a key of roles`);
  }
  for (const [role, account] of Object.entries(roles)) {
    const derived = effectivePermissions(account, seed);
    const copied = listed[role];
    if (derived === undefined) {
      if (copied !== undefined) {
        found.push(`rolePermissions["${role}"]: ${account} is a platform administrator; leave the role out`);
      }
      continue;
    }
    if (copied === undefined) {
      found.push(`rolePermissions["${role}"]: missing; the seed gives [${derived.join(", ")}]`);
      continue;
    }
    const missing = derived.filter((permission) => !copied.includes(permission));
    const extra = copied.filter((permission) => !derived.includes(permission));
    if (missing.length > 0) {
      found.push(`rolePermissions["${role}"]: lacks ${missing.join(", ")}, which the seed gives ${account}`);
    }
    if (extra.length > 0) {
      found.push(`rolePermissions["${role}"]: lists ${extra.join(", ")}, which the seed does not give ${account}`);
    }
  }
  return found;
}

try {
  const found = differences();
  process.stdout.write(found.length === 0 ? `${OK}\n` : `${found.join("\n")}\n`);
  process.exitCode = found.length === 0 ? 0 : 1;
} catch (error) {
  process.stderr.write(`facts:check: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
