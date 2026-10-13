import type { PageBuilderClient } from "@api/rest/clients/page-builder-client";
import type { PageStatus } from "@api/rest/types/page-builder";
import type { Logger } from "@core/logger";
import type { DatasetRecord } from "../dataset";

import { PAGE_STATUSES } from "@api/rest/types/page-builder";
import { requireFields } from "@core/required-fields";

/** What setting page statuses needs of the page builder: finding pages and changing their status. */
export type PageStatusApi = Pick<PageBuilderClient["pages"], "search" | "setStatus" | "publishStatus">;

/** A seeded page and the status the dataset gives it. */
interface SeededPage {
  readonly id: string;
  readonly name: string;
  readonly storeId: string;
  readonly status: PageStatus;
}

/**
 * Sets each seeded page to its dataset `status` (`Draft` when absent), skipping pages already in it.
 * Needed because the platform creates every page as a draft and changes status only through actions.
 * A published page whose content was saved again holds that content as an unpublished draft, so a page that is
 * `Published` in the dataset is published again when it has unpublished changes.
 *
 * @param pages - Signed in as an administrator.
 * @throws Error when a page record lacks its id, name or store, or names an unknown status.
 */
export async function applyPageStatuses(
  pages: PageStatusApi,
  records: readonly DatasetRecord[],
  logger: Logger,
): Promise<void> {
  const seeded = records.map(seededPage);
  const current = new Map<string, string | null | undefined>();
  for (const storeId of new Set(seeded.map((page) => page.storeId))) {
    const objectIds = seeded.filter((page) => page.storeId === storeId).map(({ id }) => id);
    for (const found of await pages.search({ storeId, objectIds, take: objectIds.length })) {
      current.set(found.id, found.status);
    }
  }
  for (const page of seeded) {
    const status = current.get(page.id);
    if (status === page.status && !(await hasUnpublishedChanges(pages, page))) {
      logger.info(`page ${page.name}: already ${page.status}`);
      continue;
    }
    await pages.setStatus(page.id, page.status);
    logger.success(
      status === page.status
        ? `page ${page.name}: ${page.status} again, its unpublished changes published`
        : `page ${page.name}: ${status ?? "not found"} → ${page.status}`,
    );
  }
}

async function hasUnpublishedChanges(pages: PageStatusApi, page: SeededPage): Promise<boolean> {
  return page.status === "Published" && (await pages.publishStatus(page.id)).hasChanges;
}

function seededPage(record: DatasetRecord): SeededPage {
  const page = requireFields(
    { id: asString(record["id"]), name: asString(record["name"]), storeId: asString(record["storeId"]) },
    ["id", "name", "storeId"],
    `Dataset page ${JSON.stringify(record["id"])}`,
  );
  const given = record["status"] ?? "Draft";
  const status = PAGE_STATUSES.find((known) => known === given);
  if (status === undefined) {
    throw new Error(
      `Dataset page ${page.id}: unknown status ${JSON.stringify(given)}; known: ${PAGE_STATUSES.join(", ")}`,
    );
  }
  return { ...page, status };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
