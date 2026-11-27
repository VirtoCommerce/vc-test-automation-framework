import * as allure from "allure-js-commons";

import { authHeader } from "@api/auth/token-client";
import { GetMeDocument } from "@api/graphql/generated/graphql";
import { requireFields } from "@core/required-fields";
import { MODULES } from "@dataset/modules";
import { STORE_ADMINISTRATOR } from "@dataset/users";
import { expect, test } from "@fixtures";

/** A customer the seeded store lists in `SiteBuilder.Store.PreviewUserIds`. */
const PREVIEW_USER_ID = "user-acme-store-employee-9";

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Site Builder / Preview as");
});

test.describe("preview as a customer (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR, requiresModules: [MODULES.siteBuilder] });

  test("the frontend answers as the preview user after the code exchange", async ({ api, env, store }) => {
    await allure.story("Preview code");
    await allure.description(
      "A preview code exchanged at the frontend's /connect/token gives a token the frontend's xAPI accepts as the " +
        "preview user, without a refresh token (VCST-6950).",
    );
    const frontend = api.anonymous().at(env.frontendBaseUrl);
    const { code } = await test.step("arrange: a preview code for the customer", () =>
      api.rest.siteBuilder.previewAuth.createCode({ storeId: store.id, userId: PREVIEW_USER_ID }));

    const token = await test.step("act: exchange the code at the frontend", () =>
      frontend.auth.exchangeSiteBuilderPreviewCode(code));

    await test.step("assert: the frontend's xAPI answers as the customer", async () => {
      const { me } = await frontend.withHeaders(authHeader(token)).graphql.execute(GetMeDocument);
      expect(me).toMatchObject({ id: PREVIEW_USER_ID });
      expect(token.refreshToken).toBeUndefined();
    });
  });

  test("a preview code works once", async ({ api, env, store }) => {
    await allure.story("Preview code");
    await allure.description("A preview code already exchanged is refused the second time.");
    const frontend = api.anonymous().at(env.frontendBaseUrl);
    const { code } = await test.step("arrange: an exchanged preview code", async () => {
      const created = await api.rest.siteBuilder.previewAuth.createCode({ storeId: store.id, userId: PREVIEW_USER_ID });
      await frontend.auth.exchangeSiteBuilderPreviewCode(created.code);
      return created;
    });

    await test.step("assert: exchanging the code again answers 400 invalid_grant", async () => {
      await expect(frontend.auth.exchangeSiteBuilderPreviewCode(code)).rejects.toBeHttpError(400, "invalid_grant");
    });
  });

  test("previewing leaves the customer's last sign-in alone", async ({ api, dataset, env, store }) => {
    await allure.story("Preview code");
    await allure.description("Previewing as a customer is not the customer signing in: the last login date stays.");
    const { userName } = requireFields(dataset.users.get(PREVIEW_USER_ID), ["userName"], PREVIEW_USER_ID);
    const before = await test.step("arrange: the customer's last login date", async () =>
      (await api.rest.users.get(userName)).lastLoginDate);

    await test.step("act: preview as the customer", async () => {
      const { code } = await api.rest.siteBuilder.previewAuth.createCode({
        storeId: store.id,
        userId: PREVIEW_USER_ID,
      });
      const token = await api.anonymous().at(env.frontendBaseUrl).auth.exchangeSiteBuilderPreviewCode(code);
      await api.anonymous().at(env.frontendBaseUrl).withHeaders(authHeader(token)).graphql.execute(GetMeDocument);
    });

    await test.step("assert: the last login date is unchanged", async () => {
      expect((await api.rest.users.get(userName)).lastLoginDate).toBe(before);
    });
  });

  test("no preview code for a user who is not a listed customer", async ({ api, store }) => {
    await allure.story("Preview users");
    await allure.description(
      "Only a customer account the store lists in SiteBuilder.Store.PreviewUserIds can be previewed as: an unlisted " +
        "customer, a listed store manager and a listed administrator are refused.",
    );
    const refused = [
      { who: "a customer the store does not list", userId: "user-acme-store-employee-8" },
      { who: "a listed store manager", userId: "user-acme-store-manager-4" },
      { who: "a listed administrator", userId: "user-acme-store-administrator" },
    ];

    for (const { who, userId } of refused) {
      await test.step(`assert: a code for ${who} answers 403`, async () => {
        await expect(api.rest.siteBuilder.previewAuth.createCode({ storeId: store.id, userId })).rejects.toBeHttpError(
          403,
        );
      });
    }
  });
});

test.describe("preview as a customer (anonymous)", () => {
  test.use({ requiresModules: [MODULES.siteBuilder] });

  test("a signed-out caller gets no preview code", async ({ api, store }) => {
    await allure.story("Preview code");
    await allure.description("Asking for a preview code needs a signed-in user with builder:preview-as.");

    await test.step("assert: asking for a preview code answers 401", async () => {
      await expect(
        api.rest.siteBuilder.previewAuth.createCode({ storeId: store.id, userId: PREVIEW_USER_ID }),
      ).rejects.toBeHttpError(401);
    });
  });
});
