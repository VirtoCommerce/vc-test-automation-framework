import type { APIRequestContext, PlaywrightWorkerArgs } from "@playwright/test";
import type { Credentials } from "@api/auth/credentials";
import type { Env } from "@core/env";

import { TokenAuthClient } from "@api/auth/token-auth-client";
import { TokenManager } from "@api/auth/token-manager";
import { GraphqlClient } from "@api/graphql/graphql-client";
import { HttpClient } from "@api/http/http-client";
import { isClientError } from "@api/http/http-error";
import { UsersClient } from "@api/rest/clients/users-client";
import { expectSucceeded } from "@dataset/arrange/security";
import { credentialsOf, newUser } from "@dataset/builders/security";

import { test as base } from "./env.fixture";

export interface ApiOptions {
  readonly user: Credentials | undefined;
}

export interface ApiWorkerFixtures {
  readonly tokenManager: TokenManager;
  readonly workerAdministrator: Credentials;
}

export interface ApiFixtures {
  readonly anonymousUserId: string;
  readonly httpClient: HttpClient;
  readonly anonymousHttpClient: HttpClient;
  readonly platformAdminHttpClient: HttpClient;
  readonly graphqlClient: GraphqlClient;
}

export const test = base.extend<ApiOptions & ApiFixtures, ApiWorkerFixtures>({
  user: [undefined, { option: true }],

  anonymousUserId: async ({}, use) => {
    await use(crypto.randomUUID());
  },

  tokenManager: [
    async ({ playwright, env }, use) => {
      const context = await openRequestContext(playwright, env, env.backendBaseUrl);
      const tokenManager = new TokenManager(new TokenAuthClient(new HttpClient(context)));
      try {
        await use(tokenManager);
        await tokenManager.signOutAll();
      } finally {
        await context.dispose();
      }
    },
    { scope: "worker" },
  ],

  workerAdministrator: [
    async ({ playwright, env, tokenManager }, use) => {
      const context = await openRequestContext(playwright, env, env.backendBaseUrl);
      try {
        const admin = await withSignInHint(env.admin, () =>
          tokenManager.authorize(new HttpClient(context), env.admin, env.storeId),
        );
        const usersClient = new UsersClient(admin);
        const draft = newUser(env.storeId, { userType: "Administrator", isAdministrator: true });
        expectSucceeded(await usersClient.create(draft), `Create worker administrator ${draft.userName}`);
        try {
          await use(credentialsOf(draft));
        } finally {
          await tokenManager.signOut(draft.userName, env.storeId);
          await usersClient.delete([draft.userName]);
        }
      } finally {
        await context.dispose();
      }
    },
    { scope: "worker" },
  ],

  httpClient: async ({ user, playwright, env, tokenManager }, use) => {
    const context = await openRequestContext(playwright, env, env.backendBaseUrl);
    try {
      const anonymous = new HttpClient(context);
      await use(
        user === undefined
          ? anonymous
          : await withSignInHint(user, () => tokenManager.authorize(anonymous, user, env.storeId)),
      );
    } finally {
      await context.dispose();
    }
  },

  anonymousHttpClient: async ({ playwright, env }, use) => {
    const context = await openRequestContext(playwright, env, env.backendBaseUrl);
    try {
      await use(new HttpClient(context));
    } finally {
      await context.dispose();
    }
  },

  platformAdminHttpClient: async ({ anonymousHttpClient, workerAdministrator, env, tokenManager }, use) => {
    await use(await tokenManager.authorize(anonymousHttpClient, workerAdministrator, env.storeId));
  },

  graphqlClient: async ({ httpClient }, use) => {
    await use(new GraphqlClient(httpClient));
  },
});

export function openRequestContext(
  playwright: PlaywrightWorkerArgs["playwright"],
  env: Env,
  baseURL: string,
): Promise<APIRequestContext> {
  return playwright.request.newContext({
    baseURL,
    timeout: env.requestTimeoutMs,
    ignoreHTTPSErrors: !env.verifySsl,
  });
}

export async function withSignInHint<T>(user: Credentials, signIn: () => Promise<T>): Promise<T> {
  try {
    return await signIn();
  } catch (error) {
    if (isClientError(error)) {
      const hint = "check the credentials, or seed the dataset with `npm run seed`";
      throw new Error(`Cannot sign in as ${user.username}: ${hint}`, { cause: error });
    }
    throw error;
  }
}

export async function asWorkerAdministrator(
  { workerAdministrator }: Pick<ApiWorkerFixtures, "workerAdministrator">,
  use: (user: Credentials | undefined) => Promise<void>,
): Promise<void> {
  await use(workerAdministrator);
}
