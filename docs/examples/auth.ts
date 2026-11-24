import type { Secret } from "@virtocommerce/test-automation-framework/core";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { expect } from "@playwright/test";
import { TokenClient, TokenManager } from "@virtocommerce/test-automation-framework/auth";

export async function signInToTwoStores(anonymous: HttpClient, password: Secret) {
  const tokens = new TokenManager(new TokenClient(anonymous));
  const buyer = { username: "buyer@example.com", password };

  try {
    const inStoreA = await tokens.signIn(anonymous, { ...buyer, storeId: "store-a" });
    const inStoreB = await tokens.signIn(anonymous, { ...buyer, storeId: "store-b" });

    expect((await inStoreA.get("/api/platform/security/currentuser")).ok).toBe(true);
    expect((await inStoreB.get("/api/platform/security/currentuser")).ok).toBe(true);
  } finally {
    await tokens.signOutAll();
  }
}
