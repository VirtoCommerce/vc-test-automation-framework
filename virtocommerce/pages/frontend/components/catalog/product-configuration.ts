import type { Locator } from "@playwright/test";

import { startsWithText } from "../../../shared/selectors.ts";
import { ProductConfigurationSection } from "./product-configuration-section.ts";

/** Configuration area of a configurable product page. */
export class ProductConfiguration {
  readonly root: Locator;

  constructor(root: Locator) {
    this.root = root;
  }

  /** @param name - Section title start, such as `Memory` (matches `Memory *`). */
  section(name: string): ProductConfigurationSection {
    return new ProductConfigurationSection(
      this.root.getByTestId("section").filter({
        has: this.root
          .page()
          .getByTestId("section-title")
          .filter({ hasText: startsWithText(name) }),
      }),
    );
  }
}
