import type { Shaped } from "@core/record-shape";
import type * as Rest from "../generated/rest-api";

import { shape } from "@core/record-shape";

type ObjectSettingEntryData = Rest.VirtoCommercePlatformCoreSettingsObjectSettingEntry;

export const SETTING_ENTRY = shape<SettingEntryData>()("Setting entry", ["name"]);
export type SettingEntry = Shaped<typeof SETTING_ENTRY>;

export type SettingEntryData = Omit<ObjectSettingEntryData, "allowedValues" | "value"> & {
  allowedValues?: unknown[] | null;
  value?: unknown;
};
