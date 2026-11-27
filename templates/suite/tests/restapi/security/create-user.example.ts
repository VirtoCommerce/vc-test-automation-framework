import { expect, test } from "@fixtures";
import { ADMINISTRATOR } from "@support/users.ts";
import { authHeader, TokenClient } from "@virtocommerce/test-automation-framework/auth";

const CURRENT_USER_PATH = "/api/platform/security/currentuser";

test.describe("sign-in (administrator)", () => {
  test.use({ user: ADMINISTRATOR });

  test("get a token with valid credentials", async ({ http, arrange }) => {
    const { user, credentials } = await test.step("arrange: a user", () => arrange.security.platformUser());

    const token = await test.step("act: request a token", () => new TokenClient(http).signIn(credentials));

    await test.step("assert: the bearer token signs the user in", async () => {
      expect(token.tokenType).toBe("Bearer");
      const current = (await http.withHeaders(authHeader(token)).get(CURRENT_USER_PATH))
        .expectOk()
        .json<{ userName: string }>();
      expect(current.userName).toBe(user.userName);
    });
  });
});
