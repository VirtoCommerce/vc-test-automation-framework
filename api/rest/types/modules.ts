import type { WithRequired } from "@core/required-fields";
import type { VirtoCommercePlatformWebModularityModuleDescriptor as ModuleDescriptorData } from "../generated/rest-api";

export type { ModuleDescriptorData };

export const MODULE_DESCRIPTOR_FIELDS = ["id", "version"] as const;

export type ModuleDescriptor = WithRequired<ModuleDescriptorData, (typeof MODULE_DESCRIPTOR_FIELDS)[number]>;
