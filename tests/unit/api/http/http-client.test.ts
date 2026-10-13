import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { APIRequestContext } from "@playwright/test";

import { createServer } from "node:http";

import { expect, test } from "@playwright/test";

import { HttpClient } from "@api/http/http-client";
import { MASK, Secret } from "@core/secret";

interface Echo {
  readonly method: string;
  readonly path: string;
  readonly query: readonly (readonly [string, string])[];
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly rawHeaderNames: readonly string[];
  readonly body: string;
}

const CLOSED_PORT_URL = "http://127.0.0.1:1/api";

let server: Server;
let baseUrl: string;
let context: APIRequestContext;
const calls = new Map<string, number>();

test.beforeAll(async ({ playwright }) => {
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => handle(request, response, Buffer.concat(chunks).toString("utf8")));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("the stub server has no port");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
  context = await playwright.request.newContext({ baseURL: baseUrl });
});

test.afterAll(async () => {
  await context.dispose();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

function handle(request: IncomingMessage, response: ServerResponse, body: string): void {
  const url = new URL(request.url ?? "/", baseUrl);
  const count = (calls.get(url.pathname) ?? 0) + 1;
  calls.set(url.pathname, count);

  if (url.pathname.startsWith("/protected/")) {
    const accepted = request.headers.authorization === "Bearer good";
    response.writeHead(accepted ? 200 : 401).end(accepted ? "{}" : "");
    return;
  }
  if (url.pathname.startsWith("/status/")) {
    response.writeHead(Number(url.pathname.split("/")[2]), "Custom Reason").end('{"error":"rejected"}');
    return;
  }
  if (url.pathname.startsWith("/deadlock-once/") && count === 1) {
    response.writeHead(500, { "Content-Type": "application/json" }).end('{"message":"40P01: deadlock detected"}');
    return;
  }
  if (url.pathname === "/slow") {
    setTimeout(() => response.writeHead(200).end("{}"), 2_000);
    return;
  }
  const echo: Echo = {
    method: request.method ?? "",
    path: url.pathname,
    query: [...url.searchParams],
    headers: request.headers,
    rawHeaderNames: request.rawHeaders.filter((_, index) => index % 2 === 0).map((name) => name.toLowerCase()),
    body,
  };
  response.writeHead(200, { "Content-Type": "application/json", "X-Echo": "yes" }).end(JSON.stringify(echo));
}

function client(): HttpClient {
  return new HttpClient(context);
}

function echoOf(path: string): Promise<Echo> {
  return client()
    .get(path)
    .then((response) => response.json<Echo>());
}

function uniquePath(prefix: string): string {
  return `/${prefix}/${test.info().testId}`;
}

test.describe("HttpClient", () => {
  test.describe("methods", () => {
    for (const method of ["get", "post", "put", "delete"] as const) {
      test(`${method} sends ${method.toUpperCase()} to the path under the base URL`, async () => {
        const response = await client()[method]("/api/items");

        expect(response.method).toBe(method.toUpperCase());
        expect(response.url).toBe(`${baseUrl}/api/items`);
        expect(response.json<Echo>()).toMatchObject({ method: method.toUpperCase(), path: "/api/items" });
      });
    }

    test("send takes the method as data", async () => {
      expect((await client().send("PUT", "/api/items")).json<Echo>().method).toBe("PUT");
    });

    test("uses an absolute URL as it is", async () => {
      expect((await client().get(`${baseUrl}/absolute`)).json<Echo>().path).toBe("/absolute");
    });
  });

  test.describe("responses", () => {
    test("returns the status, reason, headers and body", async () => {
      const response = await client().get("/status/404");

      expect(response.status).toBe(404);
      expect(response.statusText).toBe("Custom Reason");
      expect(response.text).toBe('{"error":"rejected"}');
      expect((await client().get("/api")).header("x-echo")).toBe("yes");
    });

    for (const status of [400, 401, 404, 409, 500, 503]) {
      test(`returns a ${status} instead of throwing`, async () => {
        expect((await client().get(`/status/${status}`)).status).toBe(status);
      });
    }
  });

  test.describe("query", () => {
    test("sends values as text, repeats arrays and leaves out undefined", async () => {
      const response = await client().get("/api", {
        query: { keyword: "a b&c", take: 20, active: true, ids: ["1", "2"], skip: undefined },
      });

      expect(response.json<Echo>().query).toEqual([
        ["keyword", "a b&c"],
        ["take", "20"],
        ["active", "true"],
        ["ids", "1"],
        ["ids", "2"],
      ]);
    });
  });

  test.describe("bodies", () => {
    test("sends json with its content type", async () => {
      const echo = (await client().post("/api", { json: { name: "laptop", tags: ["a"] } })).json<Echo>();

      expect(JSON.parse(echo.body)).toEqual({ name: "laptop", tags: ["a"] });
      expect(echo.headers["content-type"]).toBe("application/json");
    });

    for (const value of ["laptop", "123", "true", '{"id":"laptop"}']) {
      test(`sends the string ${value} as a JSON string`, async () => {
        const echo = (await client().post("/api", { json: value })).json<Echo>();

        expect(JSON.parse(echo.body)).toBe(value);
      });
    }

    test("lets a request header replace the JSON content type", async () => {
      const echo = (
        await client().post("/api", { json: {}, headers: { "Content-Type": "application/merge-patch+json" } })
      ).json<Echo>();

      expect(echo.headers["content-type"]).toBe("application/merge-patch+json");
      expect(echo.rawHeaderNames.filter((name) => name === "content-type")).toHaveLength(1);
    });

    test("sends a form URL-encoded", async () => {
      const echo = (await client().post("/api", { form: { grant_type: "password", username: "a b" } })).json<Echo>();

      expect(echo.body).toBe("grant_type=password&username=a+b");
      expect(echo.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    });

    test("sends multipart fields and files", async () => {
      const echo = (
        await client().post("/api", {
          multipart: {
            folder: "images",
            file: { name: "logo.png", mimeType: "image/png", buffer: Buffer.from("png-bytes") },
          },
        })
      ).json<Echo>();

      expect(echo.headers["content-type"]).toMatch(/^multipart\/form-data; boundary=/);
      expect(echo.body).toContain('name="folder"\r\n\r\nimages');
      expect(echo.body).toContain('name="file"; filename="logo.png"\r\ncontent-type: image/png\r\n\r\npng-bytes');
    });

    test("sends no body without a body option", async () => {
      expect((await client().post("/api")).json<Echo>().body).toBe("");
    });
  });

  test.describe("headers", () => {
    test("sends the client headers with every request", async () => {
      const echo = (await client().withHeaders({ "X-Store": "store-acme" }).get("/api")).json<Echo>();

      expect(echo.headers["x-store"]).toBe("store-acme");
    });

    test("asks a header provider anew for every request", async () => {
      let issued = 0;
      const signedIn = client().withHeaders(async () => ({ Authorization: `Bearer token-${++issued}` }));

      const first = (await signedIn.get("/api")).json<Echo>();
      const second = (await signedIn.get("/api")).json<Echo>();

      expect([first.headers["authorization"], second.headers["authorization"]]).toEqual([
        "Bearer token-1",
        "Bearer token-2",
      ]);
    });

    test("combines headers of chained clients, the later one winning in any letter case", async () => {
      const chained = client()
        .withHeaders({ Authorization: "Bearer first", "X-Store": "store-acme" })
        .withHeaders({ authorization: "Bearer second" });

      const echo = (await chained.get("/api")).json<Echo>();

      expect(echo.headers["authorization"]).toBe("Bearer second");
      expect(echo.headers["x-store"]).toBe("store-acme");
      expect(echo.rawHeaderNames.filter((name) => name === "authorization")).toHaveLength(1);
    });

    test("lets request headers win over client headers in any letter case", async () => {
      const signedIn = client().withHeaders({ Authorization: "Bearer client" });

      const echo = (await signedIn.get("/api", { headers: { AUTHORIZATION: "Bearer request" } })).json<Echo>();

      expect(echo.headers["authorization"]).toBe("Bearer request");
      expect(echo.rawHeaderNames.filter((name) => name === "authorization")).toHaveLength(1);
    });

    test("leaves the original client unchanged", async () => {
      const original = client();
      original.withHeaders({ "X-Store": "store-acme" });

      expect((await original.get("/api")).json<Echo>().headers["x-store"]).toBeUndefined();
      expect((await echoOf("/api")).headers["x-store"]).toBeUndefined();
    });
  });

  test.describe("failures without an answer", () => {
    test("throws when the timeout passes", async () => {
      await expect(client().get("/slow", { timeoutMs: 200 })).rejects.toThrow(/Timeout 200ms exceeded/);
    });

    test("masks known secrets in a network error", async () => {
      const token = new Secret("http-client-token-1");
      const signedIn = client().withHeaders({ Authorization: `Bearer ${token.reveal()}` });

      const error = await signedIn.get(CLOSED_PORT_URL).then(
        () => undefined,
        (reason: unknown) => reason,
      );

      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toContain("127.0.0.1:1");
      expect(String(error)).not.toContain(token.reveal());
      expect(String(error)).toContain(MASK);
    });
  });

  test.describe("authentication", () => {
    function signedIn(initial: string, renewed: string): { readonly client: HttpClient; readonly rejected: unknown[] } {
      let current = initial;
      const rejected: unknown[] = [];
      const signedInClient = client().withAuthentication({
        headers: async () => ({ Authorization: current }),
        renew: async (rejectedHeaders) => {
          rejected.push(rejectedHeaders);
          current = renewed;
        },
      });
      return { client: signedInClient, rejected };
    }

    test("sends the sign-in headers", async () => {
      const { client: signedInClient } = signedIn("Bearer good", "Bearer good");

      expect((await signedInClient.get("/api")).json<Echo>().headers["authorization"]).toBe("Bearer good");
    });

    test("renews the sign-in once after a 401 and repeats the request", async () => {
      const { client: signedInClient, rejected } = signedIn("Bearer stale", "Bearer good");
      const path = uniquePath("protected");

      const response = await signedInClient.post(path, { json: { name: "laptop" } });

      expect(response.status).toBe(200);
      expect(rejected).toEqual([{ authorization: "Bearer stale" }]);
      expect(calls.get(path)).toBe(2);
    });

    test("returns a second 401 without renewing again", async () => {
      const { client: signedInClient, rejected } = signedIn("Bearer stale", "Bearer still-stale");
      const path = uniquePath("protected");

      const response = await signedInClient.get(path);

      expect(response.status).toBe(401);
      expect(rejected).toHaveLength(1);
      expect(calls.get(path)).toBe(2);
    });

    test("does not renew for other statuses", async () => {
      const { client: signedInClient, rejected } = signedIn("Bearer good", "Bearer good");

      expect((await signedInClient.get("/status/403")).status).toBe(403);
      expect(rejected).toEqual([]);
    });

    test("returns a 401 as it is without an authentication", async () => {
      const path = uniquePath("protected");

      expect((await client().withHeaders({ Authorization: "Bearer stale" }).get(path)).status).toBe(401);
      expect(calls.get(path)).toBe(1);
    });

    test("keeps renewing after more headers are added", async () => {
      const { client: signedInClient, rejected } = signedIn("Bearer stale", "Bearer good");

      const response = await signedInClient.withHeaders({ "X-Store": "store-acme" }).get(uniquePath("protected"));

      expect(response.status).toBe(200);
      expect(rejected).toEqual([{ authorization: "Bearer stale", "x-store": "store-acme" }]);
    });
  });

  test("repeats a request the platform aborted as a deadlock", async () => {
    const path = uniquePath("deadlock-once");

    const response = await client().post(path, { json: {} });

    expect(response.status).toBe(200);
    expect(calls.get(path)).toBe(2);
  });
});
