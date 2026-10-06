import type { output } from "zod";
import type { PageBuilderClient } from "@api/rest/clients/page-builder-client";
import type { Logger } from "@core/logger";
import type { Dataset } from "./dataset";

import { enum as enumOf, object } from "zod";

import { PAGE_STATUSES } from "@api/rest/types/page-builder";
import { nonEmptyString, parseOrThrow } from "@core/validation";

const SeededPageSchema = object({
  id: nonEmptyString,
  name: nonEmptyString,
  storeId: nonEmptyString,
  status: enumOf(PAGE_STATUSES).default("Draft"),
});

type SeededPage = output<typeof SeededPageSchema>;

export async function applyPageStatuses(
  pageBuilderClient: PageBuilderClient,
  dataset: Dataset,
  logger: Logger,
): Promise<void> {
  const pages = dataset.pages.map((item) => parseOrThrow(SeededPageSchema, item, "Invalid seeded page"));
  const currentStatuses = await findCurrentStatuses(pageBuilderClient, pages);
  for (const page of pages) {
    const current = currentStatuses.get(page.id);
    if (current === page.status) {
      logger.info(`${page.name}: already ${page.status}`);
      continue;
    }
    await pageBuilderClient.setStatus(page.id, page.status);
    logger.success(`${page.name}: ${current ?? "not found"} → ${page.status}`);
  }
}

async function findCurrentStatuses(
  pageBuilderClient: PageBuilderClient,
  pages: readonly SeededPage[],
): Promise<Map<string, string | null | undefined>> {
  const storeIds = [...new Set(pages.map(({ storeId }) => storeId))];
  const found = await Promise.all(
    storeIds.map((storeId) => {
      const objectIds = pages.filter((page) => page.storeId === storeId).map(({ id }) => id);
      return pageBuilderClient.search({ storeId, objectIds, take: objectIds.length });
    }),
  );
  return new Map(found.flat().map((page) => [page.id, page.status]));
}
