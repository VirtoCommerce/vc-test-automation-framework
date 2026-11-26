import { expect, test } from "@fixtures";
import { ADMINISTRATOR } from "@support/users.ts";

test.describe("current user (administrator)", () => {
  test.use({ user: ADMINISTRATOR });

  test("the administrator's token identifies the administrator", async ({ api }) => {
    await test.step("assert: the platform names the signed-in user", async () => {
      const current = (await api.get("/api/platform/security/currentuser")).expectOk().json<{ userName: string }>();
      expect(current.userName).toBe(ADMINISTRATOR.username);
    });
  });
});
