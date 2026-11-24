# Authentication

The `auth` area signs users in to the platform with a password and keeps their access tokens. It works for platform
users, such as the administrator, and for frontend users of any store.

## Credentials

`Credentials` holds a user name, a password as a `Secret`, and, for a frontend user, the store the user signs in to.
Because the password is a `Secret`, credentials are safe to log.

## The token client

`TokenClient` calls the platform token endpoints:

| Method                 | Does                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `signIn`               | Signs a user in with a password and returns the access token                               |
| `refresh`              | Renews a token with its refresh token, or returns `undefined` when the platform rejects it |
| `revoke`               | Revokes the refresh token of a token; the access token stays valid until it expires        |
| `requestPasswordGrant` | Sends a sign-in request and returns the response whatever its status, for sign-in tests    |

The client sends each request once and does not retry a failure.

The platform returns a 500 status when the same user signs in twice at the same time. Playwright workers are separate
processes, so `signIn` takes a lock for the user and store in the temporary directory of the system: sign-ins of the
same user wait for each other, also across workers, while sign-ins of different users run at the same time. A lock
older than a minute is taken over, because its process ended without releasing it. `requestPasswordGrant` takes no
lock, so sign-in tests send exactly the requests they mean to.

## The token manager

Tests usually get tokens through `TokenManager`, which keeps one token for each user in each store:

- `signIn` signs a user in and returns an HTTP client that sends the user's current token with each request. Wrong
  credentials fail at this call, not on the first request. Pass a client for the same platform as the token client.
- Concurrent requests for the same user share one sign-in or renewal. A failed sign-in or renewal is not cached.
- A token that expires within a minute is renewed with its refresh token. When the platform rejects the refresh
  token, the user signs in again.
- A token that the platform rejects with a 401 status is forgotten, and the request is sent once more with a new
  token. Concurrent requests that receive the 401 status share one new sign-in.
- A different password for a cached user starts a new sign-in.
- `signOut` and `signOutAll` revoke the tokens that have not expired. A token is forgotten even when its revocation
  fails.

## Browser sessions

Browser tests start signed in, so they do not go through the sign-in pages. The sessions build a Playwright storage
state, which the test applies to its browser context with `setStorageState`:

- `FrontendBrowserSessions.signedIn` requests a token through the frontend's own origin and puts it into the
  frontend's local storage. The entry is `{ expires_at, token_type, access_token, refresh_token }`, the format of the
  Virto Commerce frontend. Its key is `auth`, and `storageKeys` changes it for a frontend that keeps its sign-in
  elsewhere.
- `FrontendBrowserSessions.anonymous` puts a visitor's identifier into local storage, under the key `user-id`, so the
  test knows whose cart it works with. It sends no requests.
- `PlatformBrowserSessions.signedIn` signs in to the admin UI of the platform and returns its sign-in cookie.

Both keep one sign-in for each user, and concurrent calls share it. A failed sign-in is not kept.

`FrontendBrowserSessions.signOut` and `dispose` revoke the frontend tokens. The platform cannot revoke the admin UI
cookie, so `PlatformBrowserSessions.forget` only drops it, and the next call signs in again.

A storage state holds tokens and cookies in plain text. Never log it or attach it to a report.

## Several stores

The same user can be signed in to several stores at once. Each store has its own token, and signing out of one store
keeps the others:

<!-- example: ../examples/auth.ts -->
```ts
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
```
