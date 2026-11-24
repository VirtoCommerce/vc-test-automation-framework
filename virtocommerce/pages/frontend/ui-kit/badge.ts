import type { Locator } from "@playwright/test";

/** Text of the badge (`VcBadge`) inside `scope`, such as the cart link's item count. */
export function badgeContent(scope: Locator): Locator {
  return scope.locator(".vc-badge__content");
}
