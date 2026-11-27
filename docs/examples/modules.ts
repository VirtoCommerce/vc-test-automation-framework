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
