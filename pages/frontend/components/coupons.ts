import type { Locator, Response } from "@playwright/test";

/**
 * Coupon section of the cart page: preset coupon cards of the store's public promotions (signed-in shoppers with
 * the marketing xAPI), and a card to enter any code. The frontend gives this section no `data-test-id`s, so it is
 * located by its CSS classes. Actions wait for their GraphQL response.
 */
export class CartCouponSection {
  readonly root: Locator;
  /** Preset cards: their code field is read-only. */
  readonly presetCards: Locator;
  readonly customCodeInput: Locator;
  readonly applyButton: Locator;
  /** Cards of the applied coupon; at most one. */
  readonly appliedCards: Locator;
  /** Code field of the applied card, which keeps the code once applied. */
  readonly appliedCode: Locator;
  /** Link to the account coupons page; opens in a new tab. */
  readonly viewAllLink: Locator;
  readonly removeButton: Locator;
  readonly errorMessage: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.presetCards = root.locator(".coupon-card:has(input[readonly])");
    const customCodeCard = root.locator(".coupon-card:has(input:not([readonly]))");
    this.customCodeInput = customCodeCard.locator("input").first();
    this.applyButton = customCodeCard.getByRole("button").first();
    this.appliedCards = root.locator(".coupon-card--applied");
    this.appliedCode = this.appliedCards.first().locator("input[readonly]").first();
    this.viewAllLink = root.locator(".coupons-section__link");
    this.removeButton = root.getByRole("button", { name: /remove coupon/i }).first();
    this.errorMessage = root.locator(".coupon-card__error, [role='alert']").first();
  }

  /** Label (promotion's localized label) and name of a preset card. */
  presetParts(card: Locator): { readonly label: Locator; readonly name: Locator } {
    return { label: card.locator(".coupon-card__label"), name: card.locator(".coupon-card__name") };
  }

  /** Types a code into the custom-code card and applies it; waits for the `addCoupon` response. */
  async applyCode(code: string): Promise<void> {
    await this.customCodeInput.fill(code);
    await this.#withResponse("addCoupon", () => this.applyButton.click());
  }

  /** Types a code and clicks apply without waiting: for codes the frontend rejects before adding them to the cart. */
  async enterCode(code: string): Promise<void> {
    await this.customCodeInput.fill(code);
    await this.applyButton.click();
  }

  /** Clicks the preset card of `code`; waits for the `addCoupon` response. */
  async applyPreset(code: string): Promise<void> {
    const button = this.root.getByRole("button", { name: new RegExp(`Apply coupon\\s+${code}\\b`, "i") }).first();
    await this.#withResponse("addCoupon", () => button.click());
  }

  /** Removes the applied coupon; waits for the `removeCoupon` response. */
  async remove(): Promise<void> {
    await this.#withResponse("removeCoupon", () => this.removeButton.click());
  }

  async #withResponse(mutation: string, action: () => Promise<void>): Promise<void> {
    await Promise.all([this.root.page().waitForResponse((response) => isMutation(response, mutation)), action()]);
  }
}

/** A coupon card of the account coupons page. */
export class CouponCard {
  readonly root: Locator;
  /** Copies the code to the clipboard. */
  readonly codeButton: Locator;
  readonly code: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.codeButton = root.locator(".coupon-item__code-button");
    this.code = root.locator(".coupon-item__code-value");
  }
}

function isMutation(response: Response, field: string): boolean {
  return response.url().includes("/graphql") && (response.request().postData() ?? "").includes(field);
}
