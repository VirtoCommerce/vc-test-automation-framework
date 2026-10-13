import type { WithRequired } from "@core/required-fields";
import type { VirtoCommerceWhiteLabelingCoreModelsWhiteLabelingSetting as WhiteLabelingSettingData } from "../generated/rest-api";

export type { WhiteLabelingSettingData };

export const WHITE_LABELING_SETTING_FIELDS = ["id"] as const;

export type WhiteLabelingSetting = WithRequired<
  WhiteLabelingSettingData,
  (typeof WHITE_LABELING_SETTING_FIELDS)[number]
>;
