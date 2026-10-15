import type { Locator, Page } from "@playwright/test";

import { attributeSelector } from "../../../selectors";
import { AddressFilters } from "./address-filters";

/** Pickup location card attributes to match exactly; omitted fields match any card. */
export interface PickupLocationCardFilter {
  readonly country?: string;
  readonly region?: string;
  readonly city?: string;
  readonly name?: string;
}

const PICKUP_LOCATION_CARD = ".select-address-map-list__item";

/** Modal that picks a pickup location. */
export class PickupLocationsModal {
  readonly root: Locator;
  readonly filters: AddressFilters;
  readonly cards: Locator;

  constructor(page: Page) {
    this.root = page.getByTestId("pickup-locations-modal");
    this.filters = new AddressFilters(this.root);
    this.cards = this.root.locator(PICKUP_LOCATION_CARD);
  }

  /** Location cards whose `data-country`/`data-region`/`data-city`/`data-pickup-point-name` match the filter. */
  cardsWhere(filter: PickupLocationCardFilter): Locator {
    return this.root.locator(
      `${PICKUP_LOCATION_CARD}${attributeSelector({
        "data-country": filter.country,
        "data-region": filter.region,
        "data-city": filter.city,
        "data-pickup-point-name": filter.name,
      })}`,
    );
  }
}
