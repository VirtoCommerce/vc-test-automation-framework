import type { TokenClient } from "@virtocommerce/test-automation-framework/auth";
import type { SeedRun } from "@virtocommerce/test-automation-framework/dataset";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";
import type { MANIFEST } from "./manifest.ts";

import { array, boolean, enum as enumOf, looseObject, object, string, unknown } from "zod";

import { dataset } from "./index.ts";
import { datasetUsers } from "./users.ts";

const PAGES_PATH = "/api/page-builder-pages";
const PAGE_STATUSES = ["Draft", "Published", "Archived"] as const;

type PageStatus = (typeof PAGE_STATUSES)[number];

const securityResultSchema = looseObject({ succeeded: boolean(), errors: array(unknown()).nullish() });
const pageSearchSchema = object({ results: array(looseObject({ id: string(), status: string().nullish() })) });
const publishStatusSchema = looseObject({ hasChanges: boolean() });
const datasetPageSchema = looseObject({
  id: string(),
  name: string(),
  storeId: string(),
  status: enumOf(PAGE_STATUSES).default("Draft"),
});

/**
 * Returns the work that follows some collections of the seed: after `users`, the password of every dataset user that
 * cannot sign in is reset to the dataset password, and after `pagesContent`, every page gets its dataset status.
 *
 * @param admin - A client signed in as a platform administrator.
 * @param tokens - The token client of the platform, to check whether users can sign in.
 * @param log - Receives one line for each change.
 * @returns The finishers by collection.
 */
export function seedFinishers(
  admin: HttpClient,
  tokens: TokenClient,
  log: (message: string) => void,
): NonNullable<SeedRun<typeof MANIFEST>["finishers"]> {
  return {
    users: () => resetUserPasswords(admin, tokens, log),
    pagesContent: () => applyPageStatuses(admin, log),
  };
}

async function resetUserPasswords(
  admin: HttpClient,
  tokens: TokenClient,
  log: (message: string) => void,
): Promise<void> {
  const users = datasetUsers();
  let reset = 0;
  for (const credentials of users) {
    if ((await tokens.requestPasswordGrant(credentials)).ok) {
      continue;
    }
    const path = `/api/platform/security/users/${encodeURIComponent(credentials.username)}/resetpassword`;
    const json = { newPassword: credentials.password, forcePasswordChangeOnNextSignIn: false };
    const result = (await admin.post(path, { json })).parse(securityResultSchema);
    if (!result.succeeded) {
      throw new Error(`Resetting the password of ${credentials.username} failed: ${JSON.stringify(result.errors)}`);
    }
    reset += 1;
  }
  log(`users: ${reset} of ${users.length} passwords reset to the dataset password`);
}

async function applyPageStatuses(admin: HttpClient, log: (message: string) => void): Promise<void> {
  const pages = dataset.pages.all().map((record) => datasetPageSchema.parse(record));
  const current = new Map<string, string | null | undefined>();
  for (const storeId of new Set(pages.map((page) => page.storeId))) {
    const objectIds = pages.filter((page) => page.storeId === storeId).map((page) => page.id);
    const criteria = { storeId, objectIds, take: objectIds.length };
    const { results } = (await admin.post(`${PAGES_PATH}/search`, { json: criteria })).parse(pageSearchSchema);
    for (const found of results) {
      current.set(found.id, found.status);
    }
  }
  for (const page of pages) {
    const status = current.get(page.id);
    if (status === page.status && !(await hasUnpublishedChanges(admin, page.id, page.status))) {
      continue;
    }
    await setPageStatus(admin, page.id, page.status);
    log(
      status === page.status
        ? `page ${page.name}: ${page.status} again, its unpublished changes published`
        : `page ${page.name}: ${status ?? "not found"} → ${page.status}`,
    );
  }
}

async function hasUnpublishedChanges(admin: HttpClient, id: string, status: PageStatus): Promise<boolean> {
  if (status !== "Published") {
    return false;
  }
  const path = `${PAGES_PATH}/grouped/publish-status/${encodeURIComponent(id)}`;
  return (await admin.get(path)).parse(publishStatusSchema).hasChanges;
}

async function setPageStatus(admin: HttpClient, id: string, status: PageStatus): Promise<void> {
  if (status === "Archived") {
    (await admin.post(`${PAGES_PATH}/grouped/archive`, { query: { ids: [id] } })).expectOk();
    return;
  }
  const path = `${PAGES_PATH}/grouped/publishing/${encodeURIComponent(id)}`;
  (await admin.post(path, { query: { publish: status === "Published" } })).expectOk();
}
