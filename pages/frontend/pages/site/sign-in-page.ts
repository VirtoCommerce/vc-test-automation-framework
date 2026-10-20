import type { Locator, Page } from "@playwright/test";
import type { Secret } from "@core/secret";

import { MainLayout } from "../../layouts/main-layout";

/** Sign-in page. */
export class SignInPage extends MainLayout {
  readonly path = "/sign-in";
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly forgotPasswordLink: Locator;
  readonly signInButton: Locator;
  readonly errorAlert: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = page.getByTestId("email-input");
    this.passwordInput = page.getByTestId("password-input");
    this.forgotPasswordLink = page.getByTestId("forgot-password-link");
    this.signInButton = page.getByTestId("login-button");
    this.errorAlert = page.getByTestId("sign-in-error-alert");
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
