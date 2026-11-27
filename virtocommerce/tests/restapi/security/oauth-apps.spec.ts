import type {
  OpenIddictAbstractionsOpenIddictApplicationDescriptor as OAuthApp,
  VirtoCommercePlatformWebModelSecurityOAuthAppSearchResult as OAuthAppSearchResult,
} from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { newOAuthApp } from "@builders/security.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { PLATFORM_DEFECT_TAG } from "@virtocommerce/test-automation-framework/core";

const OAUTH_APPS_PATH = "/api/platform/oauthapps";

test.describe("OAuth apps (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("create an OAuth app", async ({ api, arrange }) => {
    const draft = newOAuthApp();
    arrange.security.deleteOAuthAppLater(draft.clientId);

    const app = await test.step("act: create an OAuth app", async () =>
      (await api.post(OAUTH_APPS_PATH, { json: draft })).expectOk().json<OAuthApp>());

    await test.step("assert: the app is a confidential client", () => {
      expect(app).toMatchObject({
        clientId: draft.clientId,
        displayName: draft.displayName,
        clientType: "confidential",
      });
    });
  });

  test("list OAuth apps without their secrets", async ({ api, arrange }) => {
    const app = await test.step("arrange: an OAuth app", () => arrange.security.oauthApp());

    const listed = await test.step("act: list the apps", () => searchApps(api, {}));

    await test.step("assert: the app is listed without its secret", () => {
      expect(listed).toContainEqual(expect.objectContaining({ clientId: app.clientId, clientSecret: "" }));
    });
  });

  test("search OAuth apps by client id", {
    tag: PLATFORM_DEFECT_TAG,
    annotation: { type: "issue", description: "https://virtocommerce.atlassian.net/browse/VCST-6440" },
  }, async ({ api, arrange }) => {
    test.fail(true, "VCST-6440: the OAuth app search ignores the client id filter");
    const [app] = await test.step("arrange: two OAuth apps", async () => [
      await arrange.security.oauthApp(),
      await arrange.security.oauthApp(),
    ]);

    const found = await test.step("act: search apps by the first app's client id", () =>
      searchApps(api, { keyword: app.clientId }));

    await test.step("assert: exactly the first app is found", () => {
      expect(found.map(({ clientId }) => clientId)).toEqual([app.clientId]);
    });
  });

  test("delete an OAuth app", async ({ api, arrange }) => {
    const app = await test.step("arrange: an OAuth app", () => arrange.security.oauthApp());

    await test.step("act: delete the app", async () =>
      (await api.delete(OAUTH_APPS_PATH, { query: { clientIds: [app.clientId] } })).expectOk());

    await test.step("assert: the app is no longer listed", async () => {
      expect((await searchApps(api, {})).map(({ clientId }) => clientId)).not.toContain(app.clientId);
    });
  });
});

async function searchApps(api: HttpClient, criteria: object): Promise<OAuthApp[]> {
  return (
    (await api.post(`${OAUTH_APPS_PATH}/search`, { json: criteria })).expectOk().json<OAuthAppSearchResult>().results ??
    []
  );
}
