import { expect, test } from "@fixtures";
import { MODULES } from "@modules";
import { Secret } from "@virtocommerce/test-automation-framework/core";

const PAGE_TEXT = "Welcome to the automated test page";
const UNKNOWN_USER = { username: "fake-username@test.com", password: Secret.of("Unknown-Password-1!") } as const;

test.describe("content pages (anonymous)", () => {
  test.use({ modules: { pageBuilder: MODULES.pageBuilder } });

  test("a published page builder page is served on the frontend", async ({ frontend, page, arrange }) => {
    const published = await test.step("arrange: a published page builder page", () =>
      arrange.content.publishedPage({ texts: [PAGE_TEXT] }));
    const { permalink } = published;
    const content = frontend.content(permalink);

    const response = await test.step(`act: open ${permalink}`, () => page.goto(content.path, { waitUntil: "load" }));

    await test.step("assert: the page answers OK and shows its text", async () => {
      expect(response?.ok()).toBe(true);
      await expect(page).toHaveURL(new RegExp(`${permalink}$`));
      await expect(page.getByText(PAGE_TEXT)).toBeVisible();
    });
  });
});

test.describe("sign-in (anonymous)", () => {
  test("sign in with valid credentials", async ({ frontend, page, arrange }) => {
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customer());
    const signIn = frontend.signIn();
    const home = frontend.home();

    await test.step("arrange: the sign-in form is complete", async () => {
      await signIn.navigate();
      await expect(signIn.emailInput).toBeVisible();
      await expect(signIn.passwordInput).toBeVisible();
      await expect(signIn.forgotPasswordLink).toBeVisible();
      await expect(signIn.signInButton).toBeVisible();
    });

    await test.step(`act: sign in as ${customer.credentials.username}`, () =>
      signIn.signIn(customer.credentials.username, customer.credentials.password));

    await test.step("assert: the home page opens with the account button", async () => {
      await expect(page).toHaveURL(new RegExp(`${home.path}$`));
      await expect(home.topHeader.accountButton).toBeVisible();
    });
  });

  test("sign in with unknown credentials", async ({ frontend }) => {
    const signIn = frontend.signIn();
    await test.step("arrange: open the sign-in page", () => signIn.navigate());

    await test.step(`act: sign in as ${UNKNOWN_USER.username}`, () =>
      signIn.signIn(UNKNOWN_USER.username, UNKNOWN_USER.password));

    await test.step("assert: an error alert is shown", async () => {
      await expect(signIn.errorAlert).toBeVisible();
    });
  });
});
