import type { Shaped } from "@core/record-shape";
import type * as Rest from "../generated/rest-api";

import { shape } from "@core/record-shape";

export type CurrencyData = Rest.VirtoCommerceCoreModuleCoreCurrencyCurrency;
export type PackageTypeData = Rest.VirtoCommerceCoreModuleCorePackagePackageType;
export type SeoInfo = Rest.VirtoCommerceSeoCoreModelsSeoInfo;

export const CURRENCY = shape<CurrencyData>()("Currency", ["code", "name"]);
export type Currency = Shaped<typeof CURRENCY>;
export const PACKAGE_TYPE = shape<PackageTypeData>()("Package type", ["id", "name"]);
export type PackageType = Shaped<typeof PACKAGE_TYPE>;
