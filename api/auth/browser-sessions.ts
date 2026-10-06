import type { APIRequestContext } from "@playwright/test";
import type { Credentials } from "./credentials";
import type { AuthToken } from "./token-auth-client";
import type { TokenManager } from "./token-manager";

import { HttpClient } from "../http/http-client";
import { CookieAuthClient } from "./cookie-auth-client";

export type App = "frontend" | "backend";

export type StorageState = Awaited<ReturnType<APIRequestContext["storageState"]>>;

const EMPTY_STORAGE_STATE: StorageState = { cookies: [], origins: [] };

const FRONTEND_AUTH_KEY = "auth";
const FRONTEND_USER_ID_KEY = "user-id";

export interface BrowserSessionsOptions {
  readonly storeId: string;
  readonly frontendBaseUrl: string;
  readonly newBackendContext: () => Promise<APIRequestContext>;
}

export class BrowserSessions {
  readonly #tokenManager: TokenManager;
  readonly #options: BrowserSessionsOptions;
  readonly #backendSessions = new Map<string, StorageState>();

  constructor(tokenManager: TokenManager, options: BrowserSessionsOptions) {
    this.#tokenManager = tokenManager;
    this.#options = options;
  }

  get(app: App, user: Credentials): Promise<StorageState> {
    return app === "frontend" ? this.#frontendSession(user) : this.#backendSession(user);
  }

  anonymous(app: App, anonymousUserId: string): StorageState {
    if (app === "backend") {
      return EMPTY_STORAGE_STATE;
    }
    return frontendState(this.#options.frontendBaseUrl, [{ name: FRONTEND_USER_ID_KEY, value: anonymousUserId }]);
  }

  async signOut(user: Credentials): Promise<void> {
    this.#backendSessions.delete(backendSessionKey(user));
    await this.#tokenManager.signOut(user.username, this.#options.storeId);
  }

  async #frontendSession(user: Credentials): Promise<StorageState> {
    const token = await this.#tokenManager.getToken(user, this.#options.storeId);
    return frontendState(this.#options.frontendBaseUrl, [{ name: FRONTEND_AUTH_KEY, value: frontendAuthValue(token) }]);
  }

  async #backendSession(credentials: Credentials): Promise<StorageState> {
    const key = backendSessionKey(credentials);
    const cached = this.#backendSessions.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const context = await this.#options.newBackendContext();
    try {
      await new CookieAuthClient(new HttpClient(context)).signIn(credentials);
      const session = await context.storageState();
      this.#backendSessions.set(key, session);
      return session;
    } finally {
      await context.dispose();
    }
  }
}

function backendSessionKey({ username, password }: Credentials): string {
  return JSON.stringify([username, password]);
}

function frontendState(
  frontendBaseUrl: string,
  localStorage: StorageState["origins"][number]["localStorage"],
): StorageState {
  return { cookies: [], origins: [{ origin: new URL(frontendBaseUrl).origin, localStorage }] };
}

function frontendAuthValue(token: AuthToken): string {
  return JSON.stringify({
    expires_at: new Date(token.expiresAt).toISOString(),
    token_type: token.tokenType,
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
  });
}
