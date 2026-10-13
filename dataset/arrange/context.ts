import type { ApiSession } from "@api/api-session";
import type { SecurityResult } from "@api/rest/types/security";
import type { CleanupStack } from "@core/cleanup-stack";
import type { Dataset } from "../dataset";
import type { StoreUnderTest } from "../store-under-test";

/** What every arrange domain works with: the administrator session, the cleanup stack and the dataset. */
export interface ArrangeContext {
  /** Store administrator session that creates and deletes the data. */
  readonly admin: ApiSession;
  /** Stack that receives every cleanup action. */
  readonly cleanup: CleanupStack;
  readonly dataset: Dataset;
  readonly store: StoreUnderTest;
}

export const SEARCH_PAGE_SIZE = 100;

export function expectSucceeded(result: SecurityResult, action: string): void {
  if (result.succeeded !== true) {
    throw new Error(`${action} failed: ${JSON.stringify(result.errors)}`);
  }
}
