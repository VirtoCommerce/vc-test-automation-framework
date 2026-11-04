import type { Locator } from "@playwright/test";

import { chips } from "../../ui-kit/chip";
import { DropdownFilter } from "../../ui-kit/dropdown-filter";

/** Address filter levels, broadest first; omitted levels are not applied. */
export interface AddressFilter {
  readonly country: string;
  readonly region?: string;
  readonly city?: string;
}

/** Country, region and city filters plus keyword search of an address or pickup location list. */
export class AddressFilters {
  readonly root: Locator;
  readonly country: DropdownFilter;
  readonly region: DropdownFilter;
  readonly city: DropdownFilter;
  readonly appliedChips: Locator;
  readonly keywordInput: Locator;
  readonly searchButton: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.country = new DropdownFilter(root.getByTestId("filter-country"));
    this.region = new DropdownFilter(root.getByTestId("filter-region"));
    this.city = new DropdownFilter(root.getByTestId("filter-city"));
    this.appliedChips = chips(root);
    this.keywordInput = root.getByTestId("search-keyword-input");
    this.searchButton = root.getByTestId("search-button");
  }

  /** Applies the given levels from country to city, waiting for each level's chip before the next. */
  async apply(filter: AddressFilter): Promise<void> {
    const levels: readonly [DropdownFilter, string | undefined][] = [
      [this.country, filter.country],
      [this.region, filter.region],
      [this.city, filter.city],
    ];
    for (const [dropdown, value] of levels.filter(
      (level): level is [DropdownFilter, string] => level[1] !== undefined,
    )) {
      await dropdown.apply(value);
      await this.appliedChip(value).waitFor();
    }
  }

  /** Chip of an applied filter value, matched by contained text. */
  appliedChip(name: string): Locator {
    return this.appliedChips.filter({ hasText: name });
  }

  /** Types a keyword and clicks search; does not wait for the results. */
  async search(keyword: string): Promise<void> {
    await this.keywordInput.fill(keyword);
    await this.searchButton.click();
  }
}
