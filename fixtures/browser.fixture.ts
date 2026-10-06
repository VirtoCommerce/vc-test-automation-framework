import type { App } from "@api/auth/browser-sessions";
import type { Credentials } from "@api/auth/credentials";
import type { Env } from "@core/env";
import type { Dataset } from "@dataset/dataset";
import type { FrontendContext } from "@dataset/frontend-context";
import type { CleanupFixtures } from "./cleanup.fixture";
import type { CustomerAccountFixtures, SignedInCustomerAccount } from "./customer-account.fixture";

import { BrowserSessions } from "@api/auth/browser-sessions";
import { TokenAuthClient } from "@api/auth/token-auth-client";
import { TokenManager } from "@api/auth/token-manager";
import { GraphqlClient } from "@api/graphql/graphql-client";
import { HttpClient } from "@api/http/http-client";
import { registerDefaultCartRemoval } from "@dataset/arrange/cart";
import { signInGraphqlClient } from "@dataset/arrange/customer-account";
import { getFrontendContext } from "@dataset/frontend-context";

import { openRequestContext, withSignInHint } from "./api.fixture";
import { test as base } from "./customer-account.fixture";

export interface Shopper {
  readonly credentials: Credentials | undefined;
  readonly graphqlClient: GraphqlClient;
  readonly context: FrontendContext;
}

export interface ShopperSources {
  readonly browserCustomerAccount: SignedInCustomerAccount | undefined;
  readonly user: Credentials | undefined;
  readonly anonymousUserId: string;
  readonly anonymousHttpClient: HttpClient;
  readonly tokenManager: TokenManager;
  readonly dataset: Dataset;
  readonly env: Env;
}

export interface BrowserOptions {
  readonly app: App | undefined;
}

export interface BrowserWorkerFixtures {
  readonly browserSessions: BrowserSessions;
}

export const test = base.extend<BrowserOptions, BrowserWorkerFixtures>({
  app: [undefined, { option: true }],

  browserSessions: [
    async ({ playwright, env }, use) => {
      const frontendRequestContext = await openRequestContext(playwright, env, env.frontendBaseUrl);
      const frontendTokenManager = new TokenManager(new TokenAuthClient(new HttpClient(frontendRequestContext)));
      try {
        await use(
          new BrowserSessions(frontendTokenManager, {
            storeId: env.storeId,
            frontendBaseUrl: env.frontendBaseUrl,
            newBackendContext() {
              return openRequestContext(playwright, env, env.backendBaseUrl);
            },
          }),
        );
        await frontendTokenManager.signOutAll();
      } finally {
        await frontendRequestContext.dispose();
      }
    },
    { scope: "worker" },
  ],

  storageState: async (
    {
      app,
      user,
      browserCustomerAccount,
      anonymousUserId,
      browserSessions,
      anonymousHttpClient,
      tokenManager,
      dataset,
      env,
      cleanupStack,
    },
    use,
  ) => {
    if (app === undefined) {
      await use(undefined);
      return;
    }
    if (app === "frontend") {
      const shopper = await browserShopper({
        browserCustomerAccount,
        user,
        anonymousUserId,
        anonymousHttpClient,
        tokenManager,
        dataset,
        env,
      });
      registerDefaultCartRemoval(shopper.graphqlClient, cleanupStack, shopper.context);
    }
    const credentials = browserCustomerAccount?.credentials ?? user;
    await use(
      credentials === undefined
        ? browserSessions.anonymous(app, anonymousUserId)
        : await withSignInHint(credentials, () => browserSessions.get(app, credentials)),
    );
  },
});

export async function browserShopper(sources: ShopperSources): Promise<Shopper> {
  const { browserCustomerAccount, user, env } = sources;
  if (browserCustomerAccount !== undefined) {
    const { credentials, graphqlClient, context } = browserCustomerAccount;
    return { credentials, graphqlClient, context };
  }
  const context = getFrontendContext(sources.dataset, env.storeId, user?.username, sources.anonymousUserId);
  const graphqlClient =
    user === undefined
      ? new GraphqlClient(sources.anonymousHttpClient)
      : await signInGraphqlClient(sources.tokenManager, sources.anonymousHttpClient, user, env.storeId);
  return { credentials: user, graphqlClient, context };
}

export async function withCustomerAccount(
  {
    newCustomerAccount,
    browserSessions,
    cleanupStack,
  }: CustomerAccountFixtures & BrowserWorkerFixtures & CleanupFixtures,
  use: (account: SignedInCustomerAccount) => Promise<void>,
): Promise<void> {
  const account = await newCustomerAccount();
  cleanupStack.push(`sign out ${account.credentials.username} from the browser sessions`, () =>
    browserSessions.signOut(account.credentials),
  );
  await use(account);
}
