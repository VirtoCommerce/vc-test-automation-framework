import type { Shaped } from "@core/record-shape";
import type * as Rest from "../generated/rest-api";

import { shape } from "@core/record-shape";

export type ModuleDescriptorData = Rest.VirtoCommercePlatformWebModularityModuleDescriptor;

export const MODULE_DESCRIPTOR = shape<ModuleDescriptorData>()("Module descriptor", ["id", "version"]);
export type ModuleDescriptor = Shaped<typeof MODULE_DESCRIPTOR>;
