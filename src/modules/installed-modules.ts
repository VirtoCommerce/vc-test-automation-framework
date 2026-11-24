import type { HttpClient } from "@/http";

import { array, boolean, object, string } from "zod";

import { errorMessage, nonBlankString } from "@/core";

const MODULES_PATH = "/api/platform/modules";
const VERSION_PATTERN = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([^+]+))?(?:\+.+)?$/;

const moduleDescriptorsSchema = array(
  object({
    id: nonBlankString,
    version: string(),
    isInstalled: boolean(),
  }),
);

/**
 * A platform module that a test or a dataset collection needs, with an optional range of versions.
 *
 * @remarks
 * Without a range, any installed version meets the requirement. Set `minVersion` when the code relies on a fix or a
 * feature of that version, and `beforeVersion` when a later version changes the behaviour that the code checks.
 */
export interface ModuleRequirement {
  /** The identifier of the module, such as `VirtoCommerce.Catalog`. */
  readonly id: string;
  /** The oldest version that meets the requirement, inclusive. */
  readonly minVersion?: string | undefined;
  /** The first version that no longer meets the requirement, exclusive. */
  readonly beforeVersion?: string | undefined;
}

/** Represents the modules installed on a platform, with their versions. */
export class InstalledModules {
  readonly #versions: ReadonlyMap<string, string>;

  /**
   * Creates a set of installed modules.
   *
   * @remarks
   * A version is checked only when a requirement with a range of versions compares it, so a module whose version is in
   * another form fails only the requirements on that module.
   *
   * @param versions - The version of each module by module identifier.
   */
  constructor(versions: Readonly<Record<string, string>>) {
    this.#versions = new Map(Object.entries(versions));
  }

  /**
   * Reads the modules installed on a platform.
   *
   * @param httpClient - A client signed in as a platform administrator.
   * @returns The installed modules. Modules that the platform knows but has not installed are left out.
   * @throws {HttpError} The platform rejects the request, or the response is not a list of modules.
   */
  static async read(httpClient: HttpClient): Promise<InstalledModules> {
    const modules = (await httpClient.get(MODULES_PATH)).parse(moduleDescriptorsSchema);
    return new InstalledModules(
      Object.fromEntries(modules.filter((module) => module.isInstalled).map((module) => [module.id, module.version])),
    );
  }

  /** Gets the number of installed modules. */
  get count(): number {
    return this.#versions.size;
  }

  /**
   * Returns the installed version of a module.
   *
   * @param id - The identifier of the module.
   * @returns The version, or `undefined` when the module is not installed.
   */
  versionOf(id: string): string | undefined {
    return this.#versions.get(id);
  }

  /**
   * Returns why the installed modules do not meet a requirement.
   *
   * @param requirement - The module and the range of versions that are needed.
   * @returns The reason, such as `VirtoCommerce.Quote 3.1010.0 is older than 3.1020.0`, or `undefined` when the
   * requirement is met.
   * @throws {Error} The requirement has a range of versions, and the installed version or a version of the range is not
   * in the form `major[.minor[.patch]][-suffix][+metadata]`. The message names the module.
   */
  unmetReason(requirement: ModuleRequirement): string | undefined {
    const { id, minVersion, beforeVersion } = requirement;
    const version = this.versionOf(id);
    if (version === undefined) {
      return `${id} is not installed`;
    }
    try {
      if (minVersion !== undefined && compareModuleVersions(version, minVersion) < 0) {
        return `${id} ${version} is older than ${minVersion}`;
      }
      if (beforeVersion !== undefined && compareModuleVersions(version, beforeVersion) >= 0) {
        return `${id} ${version} is not older than ${beforeVersion}`;
      }
    } catch (error) {
      throw new Error(`${id}: ${errorMessage(error)}`, { cause: error });
    }
    return undefined;
  }

  /**
   * Returns why the installed modules do not meet several requirements.
   *
   * @param requirements - The requirements to check.
   * @returns The reason of each unmet requirement, in the order of `requirements`. It is empty when all are met.
   * @throws {Error} A version cannot be compared, as for {@link InstalledModules.unmetReason}.
   */
  unmetReasons(requirements: readonly ModuleRequirement[]): string[] {
    return requirements.flatMap((requirement) => this.unmetReason(requirement) ?? []);
  }

  /**
   * Returns the version of each module by module identifier, so the set can be saved and read again in another
   * process with the constructor.
   *
   * @returns The versions by module identifier.
   */
  toJSON(): Record<string, string> {
    return Object.fromEntries(this.#versions);
  }
}

/**
 * Compares two module versions, such as `3.1034.0` and `3.1012.1`.
 *
 * @remarks
 * The parts are compared as numbers, so `3.1034.0` is newer than `3.1012.1`. A missing part counts as 0. A build
 * with a suffix, such as `3.1035.0-pr-12`, comes before the release of the same version. Build metadata after `+`,
 * such as `3.1035.0+sha.5114f85`, is ignored.
 *
 * @param left - The first version.
 * @param right - The second version.
 * @returns A negative number when `left` is older, a positive number when it is newer, and 0 when they are equal.
 * @throws {Error} A version is not in the form `major[.minor[.patch]][-suffix][+metadata]`.
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

function parseVersion(version: string): readonly [readonly number[], string | undefined] {
  const match = VERSION_PATTERN.exec(version.trim());
  if (match === null) {
    throw new Error(`"${version}" is not a module version in the form major[.minor[.patch]][-suffix][+metadata]`);
  }
  const [, major, minor, patch, suffix] = match;
  return [[Number(major), Number(minor ?? 0), Number(patch ?? 0)], suffix];
}
