/** Page list routes of the page builder shell, one per status; pass to `PageBuilderShell.open`. */
export const Route = {
  all: "page-builder",
  draft: "page-builder-draft",
  pending: "page-builder-pending",
  active: "page-builder-active",
  archived: "page-builder-archived",
} as const;

export type PageBuilderRoute = (typeof Route)[keyof typeof Route];

/** Column ids (`data-column-id`) of the page list grid. */
export const Column = {
  name: "name",
  language: "cultureName",
  permalink: "permalink",
  modified: "modifiedDate",
  modifiedBy: "modifiedBy",
  status: "status",
} as const;

/** Toolbar item ids of the page details blade; archive's id is `delete`. */
export const DetailsToolbar = {
  save: "save",
  archive: "delete",
  openDesigner: "openPageDesigner",
  publish: "publishPage",
  unpublish: "unpublishPage",
} as const;
