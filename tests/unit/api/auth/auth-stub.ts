import type { Server } from "node:http";

import { createServer } from "node:http";

export const WRONG_PASSWORD = "wrong-password";
export const SHORT_LIVED_SECONDS = 30;
const LONG_LIVED_SECONDS = 3_600;

export interface AuthStub {
  readonly baseUrl: string;
  readonly revokedTokens: readonly string[];
  passwordGrants(username: string): number;
  refreshGrants(username: string): number;
  logins(username: string): number;
  getMeCalls(username: string): number;
  endSessions(username: string): void;
  lastForm(): Readonly<Record<string, string>>;
  close(): Promise<void>;
}

/**
 * Starts a local stand-in for the platform's token endpoints. Behaviour depends on words in the user name,
 * which can be combined: `flaky` fails with 500 once, `unavailable` always fails with 503, `short` gets sign-in tokens that expire within a minute
 * (refreshed tokens live an hour),
 * `norefresh` gets no refresh token, `malformed` gets a token without `token_type`, `rejected` gets its
 * refresh tokens refused, `unrevokable` cannot be revoked, `slow` takes 300 ms to revoke.
 * `POST /graphql` answers `GetMe` with the token's user (id `id-of-<user name>`) and echoes the `Authorization`
 * header for any other operation. `GET /echo` returns the `Authorization` header; `GET /protected` refuses with 401 the tokens of a user
 * whose sessions were ended (`endSessions`) and every token of a `banned` user. The admin UI sign-in sets a session cookie, or refuses `locked`,
 * `notallowed` and `twofactor` users with the matching flag.
 */
export async function startAuthStub(): Promise<AuthStub> {
  const passwordGrants = new Map<string, number>();
  const refreshGrants = new Map<string, number>();
  const logins = new Map<string, number>();
  const getMeCalls = new Map<string, number>();
  const issuedTokens = new Map<string, string[]>();
  const endedTokens = new Set<string>();
  const revokedTokens: string[] = [];
  let lastForm: Record<string, string> = {};

  const server: Server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });
    request.on("end", () => {
      function reply(status: number, json: unknown): void {
        response.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(json));
      }
      const path = new URL(request.url ?? "/", "http://localhost").pathname;

      if (path === "/connect/token") {
        lastForm = Object.fromEntries(new URLSearchParams(body));
        if (lastForm["grant_type"] === "refresh_token") {
          const [serial, username = ""] = (lastForm["refresh_token"] ?? "").split(":");
          const attempt = increment(refreshGrants, username);
          if (username.includes("rejected")) {
            reply(400, { error: "invalid_grant" });
            return;
          }
          reply(200, issueToken(issuedTokens, username, Number(serial) + 100 * attempt, LONG_LIVED_SECONDS));
          return;
        }
        const username = lastForm["username"] ?? "";
        const attempt = increment(passwordGrants, username);
        if (username.includes("unavailable")) {
          reply(503, { error: "service unavailable" });
        } else if (username.includes("flaky") && attempt === 1) {
          reply(500, { error: "concurrent sign-in" });
        } else if (lastForm["password"] === WRONG_PASSWORD) {
          reply(400, { error: "invalid_grant" });
        } else if (username.includes("malformed")) {
          reply(200, { access_token: `${attempt}:${username}:access`, expires_in: LONG_LIVED_SECONDS });
        } else {
          reply(
            200,
            issueToken(
              issuedTokens,
              username,
              attempt,
              username.includes("short") ? SHORT_LIVED_SECONDS : LONG_LIVED_SECONDS,
            ),
          );
        }
        return;
      }

      if (path === "/revoke/token") {
        const token = (request.headers.authorization ?? "").replace(/^Bearer /, "");
        if (token.includes("unrevokable")) {
          reply(500, { error: "revocation failed" });
          return;
        }
        const delayMs = token.includes("slow") ? 300 : 0;
        setTimeout(() => {
          revokedTokens.push(token);
          reply(200, {});
        }, delayMs);
        return;
      }

      if (path === "/echo") {
        reply(200, { authorization: request.headers.authorization ?? null });
        return;
      }

      if (path === "/graphql") {
        const { operationName } = JSON.parse(body) as { operationName?: string };
        if (operationName === "GetMe") {
          const username = (request.headers.authorization ?? "").split(":")[1];
          increment(getMeCalls, username ?? "");
          reply(200, { data: { me: username === undefined ? null : { id: `id-of-${username}`, userName: username } } });
          return;
        }
        reply(200, { data: { authorization: request.headers.authorization ?? null } });
        return;
      }

      if (path === "/protected") {
        const token = (request.headers.authorization ?? "").replace(/^Bearer /, "");
        const refused = token === "" || endedTokens.has(token) || token.includes("banned");
        reply(refused ? 401 : 200, refused ? {} : { authorization: request.headers.authorization });
        return;
      }

      if (path === "/api/platform/security/login") {
        const { userName = "", password = "" } = JSON.parse(body) as { userName?: string; password?: string };
        increment(logins, userName);
        if (password === WRONG_PASSWORD) {
          reply(200, { succeeded: false });
        } else if (userName.includes("locked")) {
          reply(200, { succeeded: false, isLockedOut: true });
        } else if (userName.includes("notallowed")) {
          reply(200, { succeeded: false, isNotAllowed: true });
        } else if (userName.includes("twofactor")) {
          reply(200, { succeeded: false, requiresTwoFactor: true });
        } else {
          response.setHeader("Set-Cookie", `.VirtoCommerce.Identity.Application=session-${userName}; Path=/; HttpOnly`);
          reply(200, { succeeded: true });
        }
        return;
      }

      reply(404, {});
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("the auth stub has no port");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    revokedTokens,
    passwordGrants: (username) => passwordGrants.get(username) ?? 0,
    refreshGrants: (username) => refreshGrants.get(username) ?? 0,
    logins: (username) => logins.get(username) ?? 0,
    getMeCalls: (username) => getMeCalls.get(username) ?? 0,
    endSessions: (username) => {
      for (const token of issuedTokens.get(username) ?? []) {
        endedTokens.add(token);
      }
    },
    lastForm: () => lastForm,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

function issueToken(
  issuedTokens: Map<string, string[]>,
  username: string,
  serial: number,
  expiresIn: number,
): Record<string, unknown> {
  const accessToken = `${serial}:${username}:access`;
  issuedTokens.set(username, [...(issuedTokens.get(username) ?? []), accessToken]);
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: expiresIn,
    ...(username.includes("norefresh") ? {} : { refresh_token: `${serial}:${username}:refresh` }),
  };
}

function increment(counts: Map<string, number>, key: string): number {
  const next = (counts.get(key) ?? 0) + 1;
  counts.set(key, next);
  return next;
}
