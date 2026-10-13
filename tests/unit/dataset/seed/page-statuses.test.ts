import type { GroupedPage, PageStatus } from "@api/rest/types/page-builder";
import type { PageStatusApi } from "@dataset/seed/page-statuses";

import { Writable } from "node:stream";

import { expect, test } from "@playwright/test";

import { Logger } from "@core/logger";
import { applyPageStatuses } from "@dataset/seed/page-statuses";

const SILENT = new Logger("seed", new Writable({ write: (_chunk, _encoding, callback) => callback() }));

/** Pages the platform holds with a status, recording every status change; `withChanges` have an unpublished draft. */
function fakePages(
  stored: Readonly<Record<string, PageStatus>>,
  withChanges: readonly string[] = [],
): PageStatusApi & {
  readonly changes: [string, PageStatus][];
  readonly searches: unknown[];
} {
  const changes: [string, PageStatus][] = [];
  const searches: unknown[] = [];
  return {
    changes,
    searches,
    search: async (criteria) => {
      searches.push(criteria);
      return Object.entries(stored)
        .filter(([id]) => criteria.objectIds?.includes(id) === true)
        .map(([id, status]): GroupedPage => ({ id, name: id, permalink: `/${id}`, status }));
    },
    setStatus: async (groupId, status) => {
      changes.push([groupId, status]);
    },
    publishStatus: async (groupId) => ({
      published: stored[groupId] === "Published",
      hasChanges: withChanges.includes(groupId),
    }),
  };
}

test.describe("applyPageStatuses", () => {
  test("publishes again a published page whose content was saved as an unpublished draft", async () => {
    const pages = fakePages({ "page-a": "Published", "page-b": "Published" }, ["page-a"]);

    await applyPageStatuses(
      pages,
      [
        { id: "page-a", name: "a", storeId: "store-1", status: "Published" },
        { id: "page-b", name: "b", storeId: "store-1", status: "Published" },
      ],
      SILENT,
    );

    expect(pages.changes).toEqual([["page-a", "Published"]]);
  });

  test("changes only the pages whose status differs from the dataset's", async () => {
    const pages = fakePages({ "page-a": "Draft", "page-b": "Published" });

    await applyPageStatuses(
      pages,
      [
        { id: "page-a", name: "a", storeId: "store-1", status: "Published" },
        { id: "page-b", name: "b", storeId: "store-1", status: "Published" },
      ],
      SILENT,
    );

    expect(pages.changes).toEqual([["page-a", "Published"]]);
  });

  test("treats a page without a status as a draft, and sets the status of a page the platform does not report", async () => {
    const pages = fakePages({ "page-a": "Published" });

    await applyPageStatuses(
      pages,
      [
        { id: "page-a", name: "a", storeId: "store-1" },
        { id: "page-c", name: "c", storeId: "store-1", status: "Archived" },
      ],
      SILENT,
    );

    expect(pages.changes).toEqual([
      ["page-a", "Draft"],
      ["page-c", "Archived"],
    ]);
  });

  test("searches each store once, for its own pages", async () => {
    const pages = fakePages({});

    await applyPageStatuses(
      pages,
      [
        { id: "page-a", name: "a", storeId: "store-1" },
        { id: "page-b", name: "b", storeId: "store-2" },
        { id: "page-c", name: "c", storeId: "store-1" },
      ],
      SILENT,
    );

    expect(pages.searches).toEqual([
      { storeId: "store-1", objectIds: ["page-a", "page-c"], take: 2 },
      { storeId: "store-2", objectIds: ["page-b"], take: 1 },
    ]);
  });

  test("rejects an unknown status, naming the page", async () => {
    await expect(
      applyPageStatuses(fakePages({}), [{ id: "page-a", name: "a", storeId: "store-1", status: "Hidden" }], SILENT),
    ).rejects.toThrow('Dataset page page-a: unknown status "Hidden"; known: Draft, Published, Archived');
  });
});
