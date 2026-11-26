# Modules

A Virto Commerce platform runs a set of modules, and each solution installs its own. Tests and dataset collections
that need a module check that it is installed, in a version they work with, and are skipped otherwise.

## Requirements

A `ModuleRequirement` names a module and, optionally, a range of versions:

| Field           | Meaning                                                           |
| --------------- | ----------------------------------------------------------------- |
| `id`            | The identifier of the module, such as `VirtoCommerce.Catalog`     |
| `minVersion`    | The oldest version that meets the requirement, inclusive          |
| `beforeVersion` | The first version that no longer meets the requirement, exclusive |

Without a range, any installed version meets the requirement. Set `minVersion` when the code relies on a fix or a
feature of that version, and `beforeVersion` when a later version changes the behaviour that the code checks. A test
suite keeps its requirements in one place, so a collection that the seed skips and the tests that use its data skip for
the same reason.

## Installed modules

`InstalledModules.read` reads the modules installed on a platform with a client signed in as a platform administrator.
Modules that the platform knows but has not installed are left out.

- `unmetReason` returns why a requirement is not met, such as `VirtoCommerce.Quote 3.1010.0 is older than 3.1020.0`,
  or `undefined` when it is met. `unmetReasons` checks several requirements at once.
- `versionOf` returns the installed version of a module, and `count` the number of installed modules.
- `toJSON` returns the version of each module by module identifier, so `JSON.stringify` saves the set, and the
  constructor creates it again from the result. A setup project reads the
  modules once and passes them to the test workers this way.

<!-- example: ../examples/modules.ts -->
```ts
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";
import type { ModuleRequirement } from "@virtocommerce/test-automation-framework/modules";

import { InstalledModules } from "@virtocommerce/test-automation-framework/modules";

const QUOTES: ModuleRequirement = { id: "VirtoCommerce.Quote", minVersion: "3.1005.0" };

export async function quoteSkipReason(admin: HttpClient): Promise<string | undefined> {
  const installed = await InstalledModules.read(admin);
  return installed.unmetReason(QUOTES);
}

export function savedForWorkers(installed: InstalledModules): string {
  return JSON.stringify(installed);
}

export function readFromSetup(saved: string): InstalledModules {
  return new InstalledModules(JSON.parse(saved));
}
```

## Versions

`compareModuleVersions` compares versions such as `3.1034.0`. The parts are compared as numbers, so `3.1034.0` is newer
than `3.1012.1`, and a missing part counts as 0. A build with a suffix, such as `3.1035.0-pr-12`, comes before the
release of the same version, and build metadata after `+`, such as `3.1035.0+sha.5114f85`, is ignored.

A version in another form, such as the four-part `1.0.0.0` of some custom modules, is an error only when it is
compared. The installed modules are read whatever their versions, and `unmetReason` fails, naming the module, only
for a requirement with a range of versions on that module.
