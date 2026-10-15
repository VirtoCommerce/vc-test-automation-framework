import type { Shaped } from "@core/record-shape";
import type * as Rest from "../generated/rest-api";

import { shape } from "@core/record-shape";

export type BlobEntryData = Rest.VirtoCommerceAssetsModuleCoreAssetsBlobEntry;
export type BlobEntrySearchResult = Rest.VirtoCommerceAssetsModuleCoreAssetsBlobEntrySearchResult;
export type BlobInfoData = Rest.VirtoCommerceAssetsModuleCoreAssetsBlobInfo;

export const BLOB_ENTRY = shape<BlobEntryData>()("Blob entry", ["name", "url"]);
export type BlobEntry = Shaped<typeof BLOB_ENTRY>;
export const BLOB_INFO = shape<BlobInfoData>()("Blob info", ["name", "url"]);
export type BlobInfo = Shaped<typeof BLOB_INFO>;
