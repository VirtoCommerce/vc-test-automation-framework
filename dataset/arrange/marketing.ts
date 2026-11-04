import type { ApiSession } from "@api/api-session";
import type { NamedEntity, NamedEntityData, Promotion } from "@api/rest/types/marketing";
import type { CleanupStack } from "@core/cleanup-stack";
import type { DynamicContentKind } from "../builders/marketing";
import type { ArrangeContext } from "./context";

import { newDynamicContent, newPromotion } from "../builders/marketing";

/** Arranges promotions and marketing dynamic content. */
export class MarketingArrange {
  readonly #admin: ApiSession;
  readonly #cleanup: CleanupStack;

  constructor({ admin, cleanup }: ArrangeContext) {
    this.#admin = admin;
    this.#cleanup = cleanup;
  }

  /** Creates an inactive promotion and deletes it after the test. */
  async promotion(): Promise<Promotion> {
    const { promotions } = this.#admin.rest;
    const draft = newPromotion();
    return this.#cleanup.track(
      `delete promotion ${draft.name}`,
      () => promotions.delete([draft.id]),
      () => promotions.create(draft),
    );
  }

  /**
   * Creates a uniquely named marketing dynamic content record and deletes it after the test.
   * Publications are created inactive.
   *
   * @param kind - `folders`, `items`, `places` or `publications`.
   */
  async dynamicContent(kind: DynamicContentKind): Promise<NamedEntity<NamedEntityData>> {
    const resource = this.#admin.rest.dynamicContent[kind];
    const draft = newDynamicContent(kind);
    return this.#cleanup.track(
      `delete dynamic content ${draft.name}`,
      () => resource.delete([draft.id]),
      () => resource.create(draft),
    );
  }
}
