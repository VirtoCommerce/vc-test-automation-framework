# Authentication

The `auth` area signs users in to the platform with a password and keeps their access tokens, and starts browsers
signed in to the frontends and the admin UI. It works for platform users, such as the administrator, and for frontend
users of any store.

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

The client sends each request once and does not retry a failure. The endpoints are `/connect/token` and
`/revoke/token`, and the `tokenPath` and `revokePath` options change them.

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

Browser tests start signed in, so they do not go through the sign-in pages. `BrowserSessions.signedIn(baseUrl,
credentials)` returns a Playwright storage state, which the test applies to its browser context with
`setStorageState`. How a user signs in is the sessions' strategy; the sessions themselves are the same for every
application:

- They keep one session for each user, store and origin, each with a request context of its own, so cookies of one
  user never reach another.
- Concurrent calls for the same user share one sign-in. A failed sign-in is not kept.
- A session that expires within a minute, or a different password for a kept user, signs in again. The old session is
  not signed out, so a failure to end it never fails the new sign-in.
- `signOut` ends a user's sessions on every origin, such as before the user is deleted, and `dispose` ends every
  session. A session past its expiry is not signed out, because the server no longer accepts it.

A storage state holds tokens and cookies in plain text. Never log it or attach it to a report.

## Sign-in strategies

A `SignInStrategy` signs one user in on a fresh request context and returns the session: its storage state and,
optionally, when it expires and how to end it on the server. The framework has three:

- `oauthLocalStorage(options)` signs in to the Virto Commerce frontend: the OAuth password grant on the frontend's
  origin, with the token in local storage as `{ expires_at, token_type, access_token, refresh_token }` under `auth`.
  `storageKey`, `tokenPath` and `revokePath` change the key and the endpoints. The session expires with the token,
  and signing out revokes it.
- `cookieSignIn(signIn, options)` signs in to an application with a cookie session: `signIn` sends the sign-in
  requests, and the session keeps the cookies that their responses set. The requests share one request context, so
  the cookies of one are sent with the next. The session expires with the first cookie that has an expiry, and the
  `signOut` option ends it on the server.
- `platformAdminSignIn` signs in to the admin UI of the platform with `POST /api/platform/security/login`. The
  platform cannot end the cookie session, so it is not signed out.

`anonymousVisitorState(frontendBaseUrl, anonymousUserId)` is the storage state of an anonymous visitor of the Virto
Commerce frontend: the visitor's identifier in local storage, under `user-id`, so the test knows whose cart it works
with. It sends no requests.

`defaultFixtures` uses `oauthLocalStorage()` for the frontends and `platformAdminSignIn` for the admin UI. A test
suite whose frontend signs users in another way passes its strategy as `frontendSignIn`. This frontend signs in with
two requests to its own server and keeps the session in cookies:

<!-- example: ../examples/sign-in-strategies.ts -->
```ts
import type { DefaultFixtures, DefaultWorkerFixtures } from "@virtocommerce/test-automation-framework/fixtures";

import { test as base } from "@playwright/test";
import { cookieSignIn } from "@virtocommerce/test-automation-framework/auth";
import { envSchema, originUrl, parseEnv } from "@virtocommerce/test-automation-framework/core";
import { defaultFixtures } from "@virtocommerce/test-automation-framework/fixtures";

const suiteEnvSchema = envSchema.extend({ FRONTEND_BASE_URL: originUrl });
type SuiteEnv = ReturnType<typeof suiteEnvSchema.parse>;
const env = parseEnv(suiteEnvSchema);

const frontendSignIn = cookieSignIn(
  async (http, { username, password, storeId }) => {
    (await http.post("/api/auth/login", { json: { username, password } })).expectOk();
    (await http.post("/api/auth/login-platform", { json: { username, password, storeId } })).expectOk();
  },
  { signOut: async (http) => (await http.post("/api/auth/logout")).expectOk() },
);

export const test = base.extend<DefaultFixtures, DefaultWorkerFixtures<SuiteEnv>>(
  defaultFixtures(env, { frontendSignIn }),
);
```

An application that fits none of them gets a strategy of its own: a function that receives the origin, a client of
it and the request context, signs the user in, and returns `{ state, expiresAt, signOut }`.

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
