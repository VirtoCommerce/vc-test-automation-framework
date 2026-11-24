import type { APIRequestContext } from "@playwright/test";

/** Cookies and local storage, in the shape of Playwright's `storageState` option and `setStorageState`. */
export type StorageState = Awaited<ReturnType<APIRequestContext["storageState"]>>;
