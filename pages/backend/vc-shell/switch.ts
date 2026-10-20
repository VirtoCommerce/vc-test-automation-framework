import type { Locator } from "@playwright/test";

/** Toggle switch of a blade; read its state on {@link input}, change it with {@link set}. */
export class Switch {
  readonly root: Locator;
  readonly input: Locator;

  /** @param root - Element holding the switch; the first one inside is used. */
  constructor(root: Locator) {
    this.root = root.locator(".vc-switch").first();
    this.input = root.locator("input[role='switch']").first();
  }

  /** Clicks the switch only if its state differs from `on`; does not wait for anything. */
  async set(on: boolean): Promise<void> {
    if ((await this.input.isChecked()) !== on) {
      await this.root.click();
    }
  }
}
