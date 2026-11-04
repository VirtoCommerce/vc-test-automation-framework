import type { Shaped } from "@core/record-shape";
import type * as Rest from "../generated/rest-api";
import type { SettingEntryData } from "./settings";

import { shape } from "@core/record-shape";

type GeneratedStoreData = Rest.VirtoCommerceStoreModuleCoreModelStore;
export type StoreSearchCriteria = Rest.VirtoCommerceStoreModuleCoreModelSearchStoreSearchCriteria;
export type StoreSearchResult = Rest.VirtoCommerceStoreModuleCoreModelSearchStoreSearchResult;

export const STORE = shape<StoreData>()("Store", ["id", "name", "catalog"]);
export type Store = Shaped<typeof STORE>;

export type StoreData = Omit<GeneratedStoreData, "settings"> & { settings?: SettingEntryData[] | null };
