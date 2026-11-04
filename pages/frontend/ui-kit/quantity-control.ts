import type { Locator } from "@playwright/test";
import type { Env } from "@core/env";

/** Quantity control the frontend renders: a stepper, or an input with an add-to-cart button. */
export type QuantityControlKind = Env["quantityControl"];

/** How an add-to-cart input applies a typed quantity: button click (product cards) or blur (line items). */
export type QuantityCommit = "click" | "blur";

/**
 * Quantity control of a product card or line item, for either configured kind. Use {@link setQuantity} instead of
 * touching the stepper or add-to-cart button directly; assert the result on {@link input}.
 *
 * @example
 * await cart.lineItem(sku).quantity.setQuantity(3);
 * await expect(cart.lineItem(sku).quantity.input).toHaveValue("3");
 */
export class QuantityControl {
  readonly root: Locator;
  /** Shows the current quantity, for either kind. */
  readonly input: Locator;
  /** What a narrow viewport shows: the stepper itself, or the add-to-cart icon button. */
  readonly compact: Locator;
  /** Exists only when the frontend renders steppers. */
  readonly stepper: Locator;
  readonly #kind: QuantityControlKind;
  readonly #commit: QuantityCommit;
  readonly #incrementButton: Locator;
  readonly #decrementButton: Locator;
  readonly #buttons: Locator;

  /**
   * @param root - Product card or line item holding the control.
   * @param commit - How the add-to-cart kind applies a typed quantity; ignored by the stepper.
   */
  constructor(root: Locator, kind: QuantityControlKind, commit: QuantityCommit) {
    this.root = root;
    this.#kind = kind;
    this.#commit = commit;
    this.stepper = root.getByTestId("quantity-stepper");
    const addToCart = root.getByTestId("add-to-cart-button");
    this.#buttons = addToCart.locator(".vc-add-to-cart__text-button, .vc-add-to-cart__icon-button");
    this.#incrementButton = this.stepper.locator(".vc-quantity-stepper__increment");
    this.#decrementButton = this.stepper.locator(".vc-quantity-stepper__decrement");
    this.input = (kind === "stepper" ? this.stepper : addToCart).locator(".vc-input__input");
    this.compact = kind === "stepper" ? this.stepper : addToCart.locator(".vc-add-to-cart__icon-button");
  }

  /**
   * Sets the quantity: stepper clicks +/- once per unit; add-to-cart types it and clicks the visible button or blurs.
   * Waits for no response; assert the outcome (input value, cart badge) with a web-first assertion.
   */
  async setQuantity(quantity: number): Promise<void> {
    if (this.#kind === "stepper") {
      const current = Number((await this.input.inputValue()) || "0");
      const button = quantity > current ? this.#incrementButton : this.#decrementButton;
      for (let step = 0; step < Math.abs(quantity - current); step++) {
        await button.click();
      }
      return;
    }
    await this.input.fill(String(quantity));
    if (this.#commit === "click") {
      await this.#buttons.filter({ visible: true }).first().click();
    } else {
      await this.input.blur();
    }
  }
}
