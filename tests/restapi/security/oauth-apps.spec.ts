import * as allure from "allure-js-commons";

import { newOAuthApp } from "@dataset/builders/security";
import { KNOWN_ISSUES } from "@dataset/known-issues";
import { expect, knownIssue, test } from "@fixtures";

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Security / OAuth Apps");
});

test.describe("OAuth apps (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("create an OAuth app", async ({ api, cleanup }) => {
    await allure.story("Create");
    await allure.description("A new OAuth app with a secret is a confidential client.");
    const draft = newOAuthApp();
    cleanup.push(`delete OAuth app ${draft.clientId}`, () => api.rest.oauthApps.delete([draft.clientId]));

    const app = await test.step("act: create an OAuth app", () => api.rest.oauthApps.create(draft));

    await test.step("assert: the app is a confidential client", () => {
      expect(app).toMatchObject({
        clientId: draft.clientId,
        displayName: draft.displayName,
        clientType: "confidential",
      });
    });
  });

  test("list OAuth apps without their secrets", async ({ api, arrange }) => {
    await allure.story("Search");
    await allure.description("A listed app has an empty secret.");
    const app = await test.step("arrange: an OAuth app", () => arrange.security.oauthApp());

    const listed = await test.step("act: list the apps", () => api.rest.oauthApps.search({}));

    await test.step("assert: the app is listed without its secret", () => {
      expect(listed).toContainEqual(expect.objectContaining({ clientId: app.clientId, clientSecret: "" }));
    });
  });

  test("search OAuth apps by client id", async ({ api, arrange }) => {
    await knownIssue(KNOWN_ISSUES.oauthAppSearchIgnoresFilters);
    await allure.story("Search");
    await allure.description("Searching by one app's client id finds that app and not another one.");
    const [app] = await test.step("arrange: two OAuth apps", async () => [
      await arrange.security.oauthApp(),
      await arrange.security.oauthApp(),
    ]);

    const found = await test.step("act: search apps by the first app's client id", () =>
      api.rest.oauthApps.search({ keyword: app.clientId }));

    await test.step("assert: exactly the first app is found", () => {
      expect(found.map(({ clientId }) => clientId)).toEqual([app.clientId]);
    });
  });

  test("delete an OAuth app", async ({ api, arrange }) => {
    await allure.story("Delete");
    await allure.description(
      "A deleted app is no longer listed. The search ignores its filters and lists every app, so the check reads all.",
    );
    const app = await test.step("arrange: an OAuth app", () => arrange.security.oauthApp());

    await test.step("act: delete the app", () => api.rest.oauthApps.delete([app.clientId]));

    await test.step("assert: the app is no longer listed", async () => {
      expect((await api.rest.oauthApps.search({})).map(({ clientId }) => clientId)).not.toContain(app.clientId);
    });
  });
});
