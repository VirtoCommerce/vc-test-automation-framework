import type { APIRequestContext } from "@playwright/test";
import type { Credentials } from "./auth/credentials";
import type { TokenManager } from "./auth/token-manager";
import type { HttpHeaders } from "./http/http-client";

import { randomUUID } from "node:crypto";

import { TokenClient } from "./auth/token-client";
import { GetMeDocument } from "./graphql/generated/graphql";
import { GraphqlClient } from "./graphql/graphql-client";
import { HttpClient } from "./http/http-client";
import { RestApi } from "./rest/rest-api";

/** Store, culture and currency the frontend works in. */
export interface StoreSettings {
  readonly storeId: string;
  readonly cultureName: string;
  readonly currencyCode: string;
}

/** Variables most xAPI operations take: store, culture, currency and user id. Spread into operation variables. */
export interface StoreContext extends StoreSettings {
  readonly userId: string;
}

/** Request context, token cache and store shared by every {@link ApiSession} of a run. */
export interface ApiConnection {
  readonly context: APIRequestContext;
  /** Token cache: each user signs in once per connection. */
  readonly tokens: TokenManager;
  /** Store used by every session's {@link ApiSession#storeContext}. */
  readonly store: StoreSettings;
}

/** Maps a known user name, such as a dataset user, to its credentials. */
export type UserResolver = (userName: string) => Credentials;

/** Who a session acts as: a user name the {@link UserResolver} knows, or explicit credentials. */
export type SessionUser = string | Credentials;

/**
 * Main entry point for API tests: REST and GraphQL clients acting as one user (or anonymously).
 * All clients share one signed-in `HttpClient`, so they share its token and its renewal after a 401.
 *
 * @example
 * const session = await ApiSession.open(connection, resolve, "acme_store_administrator@acme.com");
 * const product = await session.rest.catalog.products.get(id);
 * const { cart } = await session.graphql.execute(GetCartDocument, await session.storeContext());
 * const maintainer = await session.as("acme_store_maintainer_1@acme.com");
 */
export class ApiSession {
  /** `undefined` for an anonymous session. */
  readonly credentials: Credentials | undefined;
  /** REST clients acting as the session's user. */
  readonly rest: RestApi;
  /** xAPI client acting as the session's user. */
  readonly graphql: GraphqlClient;
  /** Anonymous token endpoint for sign-in tests; its tokens are not cached. Other tests use `rest`/`graphql`. */
  readonly auth: TokenClient;
  /** The session's raw HTTP client, for requests no REST client models (e.g. the seeder's). Tests use `rest`. */
  readonly http: HttpClient;
  readonly #connection: ApiConnection;
  readonly #resolve: UserResolver;
  #storeContext: Promise<StoreContext> | undefined;

  private constructor(
    connection: ApiConnection,
    resolve: UserResolver,
    httpClient: HttpClient,
    credentials: Credentials | undefined,
  ) {
    this.#connection = connection;
    this.#resolve = resolve;
    this.http = httpClient;
    this.credentials = credentials;
    this.auth = new TokenClient(new HttpClient(connection.context), connection.store.storeId);
    this.rest = new RestApi(httpClient, connection.store.storeId);
    this.graphql = new GraphqlClient(httpClient);
  }

  /**
   * Opens a session, signing the user in first so a wrong password fails here.
   *
   * @param user - `undefined` for an anonymous visitor.
   * @throws Whatever the resolver throws for an unknown user name; HttpError when the sign-in fails.
   */
  static async open(
    connection: ApiConnection,
    resolve: UserResolver,
    user: SessionUser | undefined,
  ): Promise<ApiSession> {
    const anonymous = new HttpClient(connection.context);
    if (user === undefined) {
      return new ApiSession(connection, resolve, anonymous, undefined);
    }
    const credentials = typeof user === "string" ? resolve(user) : user;
    const signedIn = await connection.tokens.signedIn(anonymous, credentials);
    return new ApiSession(connection, resolve, signedIn, credentials);
  }

  /**
   * Opens a signed-in session as another user over the same connection, for tests with several identities.
   *
   * @throws Whatever the resolver throws for an unknown user name; HttpError when the sign-in fails.
   */
  as(user: SessionUser): Promise<ApiSession> {
    return ApiSession.open(this.#connection, this.#resolve, user);
  }

  /** Opens an anonymous session over the same connection, to check what a signed-out visitor gets. */
  anonymous(): ApiSession {
    return new ApiSession(this.#connection, this.#resolve, new HttpClient(this.#connection.context), undefined);
  }

  /**
   * Returns an anonymous session that adds headers to every request, for credentials the connection does not
   * manage: a token from {@link ApiSession#auth} or an API key. Only for anonymous sessions, so the result never
   * claims a user its headers may not be.
   *
   * @example
   * const keyHolder = api.anonymous().withHeaders({ api_key: key.reveal() });
   *
   * @throws Error when called on a signed-in session.
   */
  withHeaders(headers: HttpHeaders): ApiSession {
    if (this.credentials !== undefined) {
      throw new Error(
        `withHeaders is for anonymous sessions; call anonymous() first instead of using ${this.credentials.username}'s`,
      );
    }
    return new ApiSession(this.#connection, this.#resolve, this.http.withHeaders(headers), undefined);
  }

  /**
   * Returns the shared xAPI variables (store, culture, currency, user id); cached per session.
   * A signed-in session fetches its user id once via `me`; an anonymous one gets a random id, so anonymous
   * sessions never share a cart.
   *
   * @example
   * const { cart } = await api.graphql.execute(GetCartDocument, { ...(await api.storeContext()), cartId });
   *
   * @throws GraphqlError when the `me` query fails; Error when it returns no user id.
   */
  storeContext(): Promise<StoreContext> {
    this.#storeContext ??= this.#loadStoreContext();
    return this.#storeContext;
  }

  /**
   * Revokes and forgets the user's token, for users a test created and deletes afterwards. No-op when anonymous.
   *
   * @throws HttpError when the platform does not confirm the revocation; the token is forgotten anyway.
   */
  async signOut(): Promise<void> {
    if (this.credentials !== undefined) {
      await this.#connection.tokens.signOut(this.credentials.username);
    }
  }

  async #loadStoreContext(): Promise<StoreContext> {
    return { ...this.#connection.store, userId: await this.#userId() };
  }

  async #userId(): Promise<string> {
    if (this.credentials === undefined) {
      return randomUUID();
    }
    const { me } = await this.graphql.execute(GetMeDocument);
    if (!me?.id) {
      throw new Error(`The platform did not give the id of "${this.credentials.username}"`);
    }
    return me.id;
  }
}
