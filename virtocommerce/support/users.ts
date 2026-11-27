import type { HttpClient } from "@virtocommerce/test-automation-framework/http";
import type { VirtoCommercePlatformCoreSecurityApplicationUser as ApplicationUser } from "../rest/generated/platform.ts";

/**
 * Returns a platform user by user name.
 *
 * @param api - A client signed in as a user who may read users.
 * @param userName - The user name.
 * @returns The user, or `undefined` when the platform has no such user.
 */
export async function userNamed(api: HttpClient, userName: string): Promise<ApplicationUser | undefined> {
  return (
    await api.get(`/api/platform/security/users/${encodeURIComponent(userName)}`)
  ).optionalJson<ApplicationUser>();
}
