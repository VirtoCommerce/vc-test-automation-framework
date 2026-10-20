import type { Locator } from "@playwright/test";

/** Chips (`VcChip`) inside `scope`, such as applied filter values. */
export function chips(scope: Locator): Locator {
  return scope.locator(".vc-chip");
}
