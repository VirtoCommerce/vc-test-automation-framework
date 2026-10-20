import type { Shaped } from "@core/record-shape";
import type * as Rest from "../generated/rest-api";

import { shape } from "@core/record-shape";

export type WhiteLabelingSettingData = Rest.VirtoCommerceWhiteLabelingCoreModelsWhiteLabelingSetting;

export const WHITE_LABELING_SETTING = shape<WhiteLabelingSettingData>()("White labeling setting", ["id"]);
export type WhiteLabelingSetting = Shaped<typeof WHITE_LABELING_SETTING>;
