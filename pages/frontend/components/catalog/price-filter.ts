import type { Locator } from "@playwright/test";
import type { Env } from "@core/env";
import type { Widget } from "../../ui-kit/widget";

import { widgetIn } from "../../ui-kit/widget";

/** How the frontend renders range filters: a slider with inputs, or checkboxes of price ranges. */
export type RangeFilterKind = Env["rangeFilterType"];

const PRICE_FACET_ID = /^filter-price-[[(](\d+(?:\.\d+)?) TO (\d+(?:\.\d+)?)[\])]$/;

/** Category price filter, for either configured range filter kind; use {@link apply} rather than its inputs. */
export class PriceFilter {
  readonly root: Locator;
  /** Filter body; hidden while the filter is collapsed. */
  readonly content: Locator;
  readonly #kind: RangeFilterKind;
  readonly #widget: Widget;

  constructor(root: Locator, kind: RangeFilterKind) {
    this.root = root;
    this.#kind = kind;
    this.#widget = widgetIn(root);
    this.content = this.#widget.content;
  }

  /**
   * Filters by a price range, expanding the filter if collapsed: the slider gets both inputs typed and blurred;
   * checkboxes get every range lying fully within `from`..`to` ticked. Does not wait for the product list to reload.
   */
  async apply(from: number, to: number): Promise<void> {
    await this.#widget.expand();
    if (this.#kind === "slider") {
      await this.root.getByTestId("slider-input-start").fill(String(from));
      await this.root.getByTestId("slider-input-end").fill(String(to));
      await this.root.getByTestId("slider-input-end").blur();
      return;
    }
    const facets = this.root.getByTestId(/^filter-price-/);
    const ids = await facets.evaluateAll((nodes) =>
      nodes.flatMap((node) => {
        const id = node.getAttribute("data-test-id");
        return id === null ? [] : [id];
      }),
    );
    for (const id of ids) {
      const bounds = PRICE_FACET_ID.exec(id);
      if (bounds !== null && Number(bounds[1]) >= from && Number(bounds[2]) <= to) {
        await this.root.getByTestId(id).click();
      }
    }
  }
}
