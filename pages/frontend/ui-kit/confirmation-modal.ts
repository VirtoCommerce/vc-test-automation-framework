import type { Locator } from "@playwright/test";

/** Frontend modal that asks to confirm an action, such as clearing the cart. */
export class ConfirmationModal {
  readonly root: Locator;
  readonly confirmButton: Locator;

  /** @param confirmButtonId - `data-test-id` of the confirm button, such as `yes-button`. */
  constructor(root: Locator, confirmButtonId: string) {
    this.root = root;
    this.confirmButton = root.getByTestId(confirmButtonId);
  }
}
