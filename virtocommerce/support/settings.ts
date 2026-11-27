import type { HttpClient } from "@virtocommerce/test-automation-framework/http";
import type { VirtoCommercePlatformCoreSettingsObjectSettingEntry as SettingEntry } from "../rest/generated/platform.ts";

/** A global platform setting; the platform sends values of any type, which the generated type misses. */
export type PlatformSetting = Omit<SettingEntry, "value" | "defaultValue" | "allowedValues"> & {
  readonly value?: unknown;
  readonly defaultValue?: unknown;
  readonly allowedValues?: readonly unknown[] | null;
};

const SETTINGS_PATH = "/api/platform/settings";

/**
 * Returns a global platform setting by its name.
 *
 * @param api - A client signed in as a user who may read settings.
 * @param name - The name of the setting, such as `Catalog.EditorialReviewTypes`.
 * @returns The setting.
 */
export async function settingOf(api: HttpClient, name: string): Promise<PlatformSetting> {
  return (await api.get(`${SETTINGS_PATH}/${encodeURIComponent(name)}`)).expectOk().json<PlatformSetting>();
}

/**
 * Saves a global platform setting.
 *
 * @param api - A client signed in as a user who may change settings.
 * @param setting - The setting with its new value or allowed values.
 */
export async function saveSetting(api: HttpClient, setting: PlatformSetting): Promise<void> {
  (await api.post(SETTINGS_PATH, { json: [setting] })).expectOk();
}
