import type { Locator, Page } from "@playwright/test";
import type { Secret } from "@core/secret";

import { FrontendPage } from "./layout";

/** Home page. */
export class HomePage extends FrontendPage {
  readonly path = "/";
}

/** Content page served at its permalink, such as a page published from the page builder. */
export class ContentPage extends FrontendPage {
  readonly path: string;

  constructor(page: Page, permalink: string) {
    super(page);
    this.path = permalink;
  }
}

/** Sign-in page. */
export class SignInPage extends FrontendPage {
  readonly path = "/sign-in";
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly forgotPasswordLink: Locator;
  readonly signInButton: Locator;
  readonly errorAlert: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = page.locator("[data-test-id='email-input']");
    this.passwordInput = page.locator("[data-test-id='password-input']");
    this.forgotPasswordLink = page.locator("[data-test-id='forgot-password-link']");
    this.signInButton = page.locator("[data-test-id='login-button']");
    this.errorAlert = page.locator("[data-test-id='sign-in-error-alert']");
  }

  /**
   * Fills the form and clicks sign in; does not wait for navigation, so wait for the URL to leave {@link path}.
   * @param email - Sign-in email; the account's user name works where it is the email.
   * @param password - Revealed only into the input.
   */
  async signIn(email: string, password: Secret): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password.reveal());
    await this.signInButton.click();
  }
}

/** Page shown after an order is placed. */
export class CheckoutCompletedPage extends FrontendPage {
  readonly path = "/checkout/completed";
  /** Carries the order number in `data-order-number`. */
  readonly orderNumberLabel: Locator;

  constructor(page: Page) {
    super(page);
    this.orderNumberLabel = page.locator("[data-order-number]");
  }
}
