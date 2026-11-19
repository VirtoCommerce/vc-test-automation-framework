import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Derives each role's permissions from the seed and compares them with `rolePermissions` in `.qa/project.json`, which
 * is copied by hand. For every key of `roles`, the account's permissions are those of:
 * - the user's global roles (`roles` in `dataset/data/users/`);
 * - the organization the account signs in to, which is its default organization (`defaultOrganizationId` of the
 *   user's contact in `dataset/data/contacts/`): the roles of its membership there (`roles` in
 *   `dataset/data/organization-memberships/`) and that organization's own roles (`roles` in
 *   `dataset/data/organizations/`, the field the seeder sends to `/api/members`, typed `OrganizationRole[]` in
 *   `api/rest/generated/rest-api.ts`), and none of them when that membership is locked or blocked. This follows the
 *   Customer module's `OrganizationIdClaimProvider.AddOrgScopedPermissionsAsync` as the review describes it (the
 *   requested organization, otherwise the default one); its source is not in this repository. Roles of the account's
 *   other organizations are never added.
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
const BLOCKED_STATUS = /block|lock/i;
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
  const signedInTo = text(contact?.["defaultOrganizationId"]);
  if (signedInTo === undefined) {
    if (memberships.some((membership) => list(membership["roles"]).length > 0)) {
      throw new Error(`${account} has membership roles but its contact names no defaultOrganizationId`);
    }
    return permissionsOf(roleIds, seed.roles);
  }
  const membership = memberships.find((item) => item["organizationId"] === signedInTo);
  if (membership !== undefined && isBlocked(membership)) {
    return permissionsOf(roleIds, seed.roles);
  }
  const where = `membership of ${account} in ${signedInTo}`;
  roleIds.push(...list(membership?.["roles"]).map((entry) => roleIdOf(entry, seed.roles, where)));
  const organization = seed.organizations.find((item) => text(item["id"]) === signedInTo);
  roleIds.push(
    ...list(organization?.["roles"]).map((entry) => roleIdOf(entry, seed.roles, `organization ${signedInTo}`)),
  );
  return permissionsOf(roleIds, seed.roles);
}

function permissionsOf(roleIds: readonly string[], roles: RoleIndex): string[] {
  return [...new Set(roleIds.flatMap((id) => roles.byId.get(id) ?? []))].sort();
}

/** A membership the platform takes no roles from: `isLocked`, a `lockoutEnd` still ahead, or a blocked or locked status. */
function isBlocked(membership: Json): boolean {
  const lockoutEnd = text(membership["lockoutEnd"]);
  return (
    membership["isLocked"] === true ||
    (lockoutEnd !== undefined && Date.parse(lockoutEnd) > Date.now()) ||
    BLOCKED_STATUS.test(text(membership["status"]) ?? "")
  );
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
