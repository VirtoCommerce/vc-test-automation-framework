/**
 * A platform module that a dataset collection or a test needs. Without a version range any installed version
 * will do; give `minVersion` when the code relies on a fix or feature of that version, and `beforeVersion` when
 * a later version changes the behaviour it checks.
 */
export interface ModuleRequirement {
  readonly id: string;
  /** Oldest version that meets the requirement, inclusive. */
  readonly minVersion?: string;
  /** First version that no longer meets the requirement, exclusive. */
  readonly beforeVersion?: string;
}

/** Installed platform modules: version by module id. */
export type InstalledModules = ReadonlyMap<string, string>;

const VERSION = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-(.+))?$/;

/**
 * Compares two module versions such as `3.1034.0`: numerically part by part, so `3.1034.0` is newer than
 * `3.1012.1`. A build with a suffix, such as `3.1035.0-pr-12`, comes before its release.
 *
 * @returns A negative number when `left` is older, positive when newer, `0` when equal.
 * @throws Error when a version is not `major[.minor[.patch]][-suffix]`.
 */
export function compareModuleVersions(left: string, right: string): number {
  const [leftParts, leftSuffix] = parseVersion(left);
  const [rightParts, rightSuffix] = parseVersion(right);
  for (const [index, part] of leftParts.entries()) {
    const difference = part - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  if (leftSuffix === rightSuffix) {
    return 0;
  }
  if (leftSuffix === undefined || rightSuffix === undefined) {
    return leftSuffix === undefined ? 1 : -1;
  }
  return leftSuffix.localeCompare(rightSuffix, "en", { numeric: true });
}

/**
 * Tells why an installed module set does not meet a requirement.
 *
 * @returns The reason, such as `VirtoCommerce.PageBuilderModule 3.1012.1 is older than 3.1034.0`, or `undefined`
 *   when the requirement is met.
 */
export function unmetReason(requirement: ModuleRequirement, installed: InstalledModules): string | undefined {
  const { id, minVersion, beforeVersion } = requirement;
  const version = installed.get(id);
  if (version === undefined) {
    return `${id} is not installed`;
  }
  if (minVersion !== undefined && compareModuleVersions(version, minVersion) < 0) {
    return `${id} ${version} is older than ${minVersion}`;
  }
  if (beforeVersion !== undefined && compareModuleVersions(version, beforeVersion) >= 0) {
    return `${id} ${version} is not older than ${beforeVersion}`;
  }
  return undefined;
}

/** Returns the reasons of every unmet requirement, in the given order; empty when all are met. */
export function unmetReasons(requirements: readonly ModuleRequirement[], installed: InstalledModules): string[] {
  return requirements.flatMap((requirement) => unmetReason(requirement, installed) ?? []);
}

function parseVersion(version: string): readonly [readonly number[], string | undefined] {
  const match = VERSION.exec(version.trim());
  if (match === null) {
    throw new Error(`"${version}" is not a module version (major[.minor[.patch]][-suffix])`);
  }
  const [, major, minor, patch, suffix] = match;
  return [[Number(major), Number(minor ?? 0), Number(patch ?? 0)], suffix];
}
