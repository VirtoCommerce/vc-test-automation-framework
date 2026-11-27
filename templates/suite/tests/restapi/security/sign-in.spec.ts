import { expect, test } from "@fixtures";
import { ADMINISTRATOR } from "@support/users.ts";

const CURRENT_USER_PATH = "/api/platform/security/currentuser";

test.describe("sign-in (administrator)", () => {
  test.use({ user: ADMINISTRATOR });

  test("the administrator's token identifies the administrator", async ({ api }) => {
    const response = await test.step("act: ask the platform for the signed-in user", () => api.get(CURRENT_USER_PATH));

    await test.step("assert: the platform names the administrator", () => {
      const current = response.expectOk().json<{ userName: string }>();
      expect(current.userName).toBe(ADMINISTRATOR.username);
    });
  });
});
