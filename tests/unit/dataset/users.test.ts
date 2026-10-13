import { expect, test } from "@playwright/test";

import { Secret } from "@core/secret";
import { loadDataset } from "@dataset/dataset";
import { credentialsOf } from "@dataset/users";

const dataset = loadDataset({
  STORE_ID: "store-under-test",
  FRONTEND_BASE_URL: "https://frontend.example.com",
  USERS_PASSWORD: "users-test-password-1",
  GOOGLE_MAPS_API_KEY: "",
});

test.describe("credentialsOf", () => {
  test("gives a dataset user's name and password as a Secret", () => {
    const credentials = credentialsOf(dataset, "acme_store_maintainer_1@acme.com");

    expect(credentials.username).toBe("acme_store_maintainer_1@acme.com");
    expect(credentials.password).toBeInstanceOf(Secret);
    expect(credentials.password.reveal()).toBe("users-test-password-1");
  });

  test("throws for a user the dataset does not have", () => {
    expect(() => credentialsOf(dataset, "nobody@acme.com")).toThrow('Dataset has no user "nobody@acme.com"');
  });

  test("matches the user name exactly", () => {
    expect(() => credentialsOf(dataset, "ACME_STORE_MAINTAINER_1@acme.com")).toThrow("Dataset has no user");
  });
});
