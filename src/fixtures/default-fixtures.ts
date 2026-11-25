import type {
  APIRequest,
  APIRequestContext,
  Fixtures,
  PlaywrightTestArgs,
  PlaywrightTestOptions,
  PlaywrightWorkerArgs,
  PlaywrightWorkerOptions,
} from "@playwright/test";
import type { Credentials, SignInStrategy } from "@/auth";
import type { Env } from "@/core";
import type { ModuleRequirement } from "@/modules";

import { BrowserSessions, oauthLocalStorage, platformAdminSignIn, TokenClient, TokenManager } from "@/auth";
import { GraphqlClient } from "@/graphql";
import { HttpClient } from "@/http";
import { InstalledModules } from "@/modules";

/** The fixtures that one worker shares between its tests. */
export interface DefaultWorkerFixtures<TEnv extends Env> {
  /**
   * The environment variables of the test suite. The other fixtures read the platform and the administrator from it,
   * so a test suite that overrides it points them all elsewhere.
   */
  readonly env: TEnv;
  /**
   * A client of the platform without authentication, for the work of the worker, such as signing in and arranging
   * data that the tests of a file share.
   */
  readonly workerHttp: HttpClient;
  /**
   * Signs users in to the platform once for each worker, keeps their tokens fresh, and signs them out when the worker
   * ends. Sign a user out with `signOut` before the user is deleted.
   */
  readonly tokens: TokenManager;
  /**
   * A client of the platform signed in as the administrator of the environment, for the work of the worker, such as
   * arranging data that the tests of a file share.
   */
  readonly workerAdmin: HttpClient;
  /**
   * Builds the storage states that start a browser signed in to a frontend, with the `frontendSignIn` strategy. Its
   * sessions are signed out when the worker ends.
   */
  readonly frontendSessions: BrowserSessions;
  /** Builds the storage states that start a browser signed in to the admin UI of the platform. */
  readonly platformSessions: BrowserSessions;
}

/** The fixtures of one test. */
export interface DefaultFixtures {
  /** The request context of the test, disposed of after it. */
  readonly apiContext: APIRequestContext;
  /** A client of the platform without authentication. */
  readonly http: HttpClient;
  /** Returns a client of the platform signed in as a user. The token is cached for the worker. */
  readonly signIn: (credentials: Credentials) => Promise<HttpClient>;
  /** A GraphQL client of the platform without authentication. */
  readonly graphql: GraphqlClient;
  /**
   * The modules that the tests need, set with `test.use`, such as `{ QUOTES, XPICKUP }`. The keys are labels; a test
   * whose module is not installed or not in its range of versions is skipped, with the reason.
   */
  readonly modules: Readonly<Record<string, ModuleRequirement>>;
  /**
   * Skips a test whose required modules do not qualify. It runs for every test, but reads the modules only when the
   * test names requirements; tests do not use it.
   */
  readonly checkModules: undefined;
}

/** The options of {@link defaultFixtures}. */
export interface DefaultFixturesOptions {
  /**
   * How users sign in to the frontends. The default is `oauthLocalStorage()`, the strategy of the Virto Commerce
   * frontend.
   */
  readonly frontendSignIn?: SignInStrategy | undefined;
}

/** The definitions of the default fixtures, for `test.extend`. */
export type DefaultFixtureDefinitions<TEnv extends Env> = Fixtures<
  DefaultFixtures,
  DefaultWorkerFixtures<TEnv>,
  PlaywrightTestArgs & PlaywrightTestOptions,
  PlaywrightWorkerArgs & PlaywrightWorkerOptions
>;

/**
 * Returns the fixtures that tests of a Virto Commerce solution need, for its platform and its frontends, for
 * `test.extend`.
 *
 * @remarks
 * - Users sign in once for each worker, and the tests of the worker reuse their tokens. They are signed out when the
 *   worker ends.
 * - Each test has its own request context, disposed of after it. Every request appears in the trace of the test that
 *   runs at the time; requests of the worker, such as sign-ins and reading the modules, appear in the trace of the
 *   test that first needs them.
 * - A test whose `modules` do not qualify is skipped, with the reason. A module version that cannot be
 *   compared fails the test. The modules are read, as the administrator, only for a test that names requirements.
 * - Browser tests start signed in: the test suite applies a storage state of `frontendSessions` or `platformSessions`
 *   to `context`, so no sign-in page is needed.
 * - TypeScript cannot infer the fixture types from the definitions, so pass them to `extend`, as in the example.
 *
 * @example
 * export const test = base
 *   .extend<DefaultFixtures, DefaultWorkerFixtures<SuiteEnv>>(defaultFixtures(env))
 *   .extend<{ storeAdmin: HttpClient }>({
 *     storeAdmin: async ({ signIn }, use) => use(await signIn(credentialsOf(STORE_ADMINISTRATOR))),
 *   });
 *
 * @param env - The parsed environment variables of the test suite, the value of the `env` fixture.
 * @param options - The frontend sign-in strategy, for a test suite whose frontend signs users in another way.
 * @returns The fixture definitions.
 */
export function defaultFixtures<TEnv extends Env>(
  env: TEnv,
  options: DefaultFixturesOptions = {},
): DefaultFixtureDefinitions<TEnv> {
  return {
    env: [async ({}, use) => use(env), { scope: "worker", box: true }],

    workerHttp: [
      async ({ playwright, env }, use) => {
        const context = await playwright.request.newContext(contextOptions(env));
        await use(new HttpClient(context, env.BACKEND_BASE_URL));
        await context.dispose();
      },
      { scope: "worker", box: true },
    ],

    tokens: [
      async ({ workerHttp }, use) => {
        const tokens = new TokenManager(new TokenClient(workerHttp));
        await use(tokens);
        await tokens.signOutAll();
      },
      { scope: "worker", box: true },
    ],

    workerAdmin: [
      async ({ workerHttp, tokens, env }, use) => use(await tokens.signIn(workerHttp, administratorOf(env))),
      { scope: "worker", title: "sign in as the administrator" },
    ],

    frontendSessions: [
      async ({ playwright, env }, use) => {
        const sessions = new BrowserSessions({
          newContext: () => playwright.request.newContext(contextOptions(env)),
          strategy: options.frontendSignIn ?? oauthLocalStorage(),
        });
        await use(sessions);
        await sessions.dispose();
      },
      { scope: "worker", box: true },
    ],

    platformSessions: [
      async ({ playwright, env }, use) => {
        const sessions = new BrowserSessions({
          newContext: () => playwright.request.newContext(contextOptions(env)),
          strategy: platformAdminSignIn,
        });
        await use(sessions);
        await sessions.dispose();
      },
      { scope: "worker", box: true },
    ],

    apiContext: [
      async ({ playwright, env }, use) => {
        const context = await playwright.request.newContext(contextOptions(env));
        await use(context);
        await context.dispose();
      },
      { box: true },
    ],

    http: [async ({ apiContext, env }, use) => use(new HttpClient(apiContext, env.BACKEND_BASE_URL)), { box: true }],

    signIn: [async ({ http, tokens }, use) => use((credentials) => tokens.signIn(http, credentials)), { box: true }],

    graphql: [async ({ http }, use) => use(new GraphqlClient(http)), { box: true }],

    modules: [{}, { option: true }],

    checkModules: [
      async ({ modules, workerHttp, tokens, env }, use, testInfo) => {
        const requirements = Object.values(modules);
        if (requirements.length > 0) {
          const installed = await InstalledModules.read(await tokens.signIn(workerHttp, administratorOf(env)));
          const reasons = installed.unmetReasons(requirements);
          testInfo.skip(reasons.length > 0, reasons.join("; "));
        }
        await use(undefined);
      },
      { auto: true, box: true },
    ],
  };
}

function administratorOf(env: Env): Credentials {
  return { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD };
}

function contextOptions(env: Env): Parameters<APIRequest["newContext"]>[0] {
  return { ignoreHTTPSErrors: !env.VERIFY_SSL, timeout: env.REQUEST_TIMEOUT_MS };
}
