import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { APIRequestContext } from "@playwright/test";
import type { RequestHeaders } from "@/http";

import { createServer } from "node:http";

import { expect, request, test } from "@playwright/test";

import { MASKED, Secret } from "@/core";
import { HttpClient } from "@/http";

type Echo = {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
};

const FRESH_TOKEN = "Bearer Fresh-Token-1";

let server: Server;
let context: APIRequestContext;
let baseUrl: string;
let received: Echo[] = [];

test.beforeAll(async () => {
  server = createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  context = await request.newContext();
});

test.afterAll(async () => {
  await context.dispose();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test.beforeEach(() => {
  received = [];
});

test.describe("HttpClient constructor", () => {
  for (const baseUrl of ["http://localhost:8090/", "http://localhost:8090/api", "localhost:8090", ""]) {
    test(`rejects ${JSON.stringify(baseUrl)}, which is not a canonical origin`, () => {
      expect(() => new HttpClient(context, baseUrl)).toThrow("baseUrl must be a canonical origin");
    });
  }

  test("keeps credentials in a rejected base URL out of the error message", () => {
    expect(() => new HttpClient(context, "http://admin:Base-Password-1@localhost:8090")).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("Base-Password-1") }),
    );
  });
});

test.describe("HttpClient.send", () => {
  test("returns the status, status text, lowercase headers and body", async () => {
    const response = await client().get("/echo");

    expect(response).toMatchObject({ method: "GET", status: 200, statusText: "OK" });
    expect(response.headers["content-type"]).toBe("application/json");
    expect(response.json<Echo>()).toMatchObject({ method: "GET", url: "/echo" });
  });

  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"] as const) {
    test(`sends ${method} with its shorthand`, async () => {
      const shorthand = method.toLowerCase() as "get" | "post" | "put" | "patch" | "delete";

      expect((await client()[shorthand]("/echo")).json<Echo>().method).toBe(method);
    });
  }

  test("returns a non-2xx status without throwing", async () => {
    expect((await client().get("/status/500")).status).toBe(500);
  });

  test("returns a 3xx without following it", async () => {
    const response = await client().get("/redirect");

    expect(response.status).toBe(302);
    expect(received.map((echo) => echo.url)).toEqual(["/redirect"]);
  });

  for (const path of ["//evil.example/api", "https://evil.example/api", "http://127.0.0.1:1/api"]) {
    test(`refuses ${path}, which leaves the base origin, and sends nothing`, async () => {
      await expect(client().get(path)).rejects.toThrow("a client only sends to");
      expect(received).toEqual([]);
    });
  }

  test("throws an Error with secrets masked when no response arrives", async () => {
    const token = Secret.of("Bearer Hanging-Token-1");
    const authenticated = client().withHeaders(async () => ({ authorization: token }));

    const error = await authenticated.get("/hang", { timeoutMs: 200 }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(`authorization: ${MASKED}`);
    expect((error as Error).message).not.toContain("Hanging-Token-1");
  });
});

test.describe("HttpClient query", () => {
  test("appends values, repeats an array and omits undefined", async () => {
    const response = await client().get("/echo?fixed=1", {
      query: { take: 10, active: true, id: ["a", "b"], skip: undefined, term: "a b&c" },
    });

    expect(response.json<Echo>().url).toBe("/echo?fixed=1&take=10&active=true&id=a&id=b&term=a+b%26c");
  });

  test("reveals a Secret when sent and masks it in the response URL", async () => {
    const response = await client().get("/echo", { query: { api_key: Secret.of("Query Secret&1") } });

    expect(response.json<Echo>().url).toBe("/echo?api_key=Query+Secret%261");
    expect(response.url).toBe(`${baseUrl}/echo?api_key=${MASKED}`);
  });
});

test.describe("HttpClient headers", () => {
  test("sends headers from withHeaders, revealing a Secret", async () => {
    const response = await client()
      .withHeaders({ "Accept-Language": "en-US", "X-Api-Key": Secret.of("Header-Secret-1") })
      .get("/echo");

    expect(response.json<Echo>().headers).toMatchObject({ "accept-language": "en-US", "x-api-key": "Header-Secret-1" });
  });

  test("overrides same-named headers whatever their case: later withHeaders, then per request", async () => {
    const derived = client().withHeaders({ "X-Layer": "first", "X-Kept": "kept" }).withHeaders({ "x-layer": "second" });

    expect((await derived.get("/echo")).json<Echo>().headers).toMatchObject({ "x-layer": "second", "x-kept": "kept" });
    expect((await derived.get("/echo", { headers: { "X-LAYER": "request" } })).json<Echo>().headers).toMatchObject({
      "x-layer": "request",
    });
  });

  test("leaves the client it is derived from unchanged", async () => {
    const base = client();
    base.withHeaders({ "X-Extra": "1" });

    expect((await base.get("/echo")).json<Echo>().headers).not.toHaveProperty("x-extra");
  });

  test("keeps the headers given to withHeaders, not later changes to that object", async () => {
    const headers: Record<string, string> = { "X-Value": "before" };
    const derived = client().withHeaders(headers);
    headers["X-Value"] = "after";

    expect((await derived.get("/echo")).json<Echo>().headers["x-value"]).toBe("before");
  });

  test("calls a header provider for every request", async () => {
    let calls = 0;
    const derived = client().withHeaders(async () => ({ "X-Call": String(++calls) }));

    await derived.get("/echo");
    const response = await derived.get("/echo");

    expect(response.json<Echo>().headers["x-call"]).toBe("2");
  });
});

test.describe("HttpClient body", () => {
  class Credentials {
    readonly password: Secret;

    constructor(password: Secret) {
      this.password = password;
    }
  }

  test("sends json with its content type, revealing a Secret at any depth", async () => {
    const password = Secret.of("Json-Secret-1");

    const echo = (
      await client().post("/echo", { json: { list: [password], nested: new Credentials(password) } })
    ).json<Echo>();

    expect(echo.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(echo.body)).toEqual({ list: ["Json-Secret-1"], nested: { password: "Json-Secret-1" } });
  });

  test("sends a json string as a JSON string", async () => {
    expect((await client().post("/echo", { json: "text" })).json<Echo>().body).toBe('"text"');
  });

  test("lets a per-request content type override the json one", async () => {
    const response = await client().post("/echo", {
      json: {},
      headers: { "Content-Type": "application/merge-patch+json" },
    });

    expect(response.json<Echo>().headers["content-type"]).toBe("application/merge-patch+json");
  });

  test("sends a form, revealing a Secret", async () => {
    const echo = (
      await client().post("/echo", { form: { user: "admin", password: Secret.of("Form-Secret-1") } })
    ).json<Echo>();

    expect(echo.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(echo.body).toBe("user=admin&password=Form-Secret-1");
  });

  test("sends form numbers and booleans as text", async () => {
    expect((await client().post("/echo", { form: { take: 10, active: true } })).json<Echo>().body).toBe(
      "take=10&active=true",
    );
  });

  test("ignores a client's default content type for form and multipart bodies", async () => {
    const derived = client().withHeaders({ "Content-Type": "application/json" });

    const form = (await derived.post("/echo", { form: { user: "admin" } })).json<Echo>();
    const multipart = (await derived.post("/echo", { multipart: { user: "admin" } })).json<Echo>();

    expect(form.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(multipart.headers["content-type"]).toMatch(/^multipart\/form-data; boundary=/);
  });

  test("lets a per-request content type override the form one", async () => {
    const response = await client().post("/echo", {
      form: { user: "admin" },
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
    });

    expect(response.json<Echo>().headers["content-type"]).toBe("application/x-www-form-urlencoded; charset=utf-8");
  });

  test("sends multipart fields and files, revealing a Secret", async () => {
    const echo = (
      await client().post("/echo", {
        multipart: {
          token: Secret.of("Multipart-Secret-1"),
          file: { name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("file content") },
        },
      })
    ).json<Echo>();

    expect(echo.headers["content-type"]).toMatch(/^multipart\/form-data; boundary=/);
    expect(echo.body).toContain("Multipart-Secret-1");
    expect(echo.body).toContain('filename="a.txt"');
    expect(echo.body).toContain("file content");
  });

  test("sends no body and no content type without a body option", async () => {
    const echo = (await client().post("/echo")).json<Echo>();

    expect(echo.body).toBe("");
    expect(echo.headers).not.toHaveProperty("content-type");
  });
});

test.describe("HttpClient.withAuthentication", () => {
  test("renews once after a 401 with the rejected headers, then resends with fresh ones", async () => {
    const rejected: RequestHeaders[] = [];
    let token = "Bearer Stale-Token-1";
    const authenticated = client().withAuthentication({
      headers: async () => ({ authorization: token }),
      renew: async (headers) => {
        rejected.push(headers);
        token = FRESH_TOKEN;
      },
    });

    const response = await authenticated.post("/protected", { json: { id: 1 } });

    expect(response.status).toBe(200);
    expect(rejected).toEqual([{ authorization: "Bearer Stale-Token-1" }]);
    expect(received.map((echo) => [echo.headers["authorization"], echo.body])).toEqual([
      ["Bearer Stale-Token-1", '{"id":1}'],
      [FRESH_TOKEN, '{"id":1}'],
    ]);
  });

  test("returns a second 401 without renewing again", async () => {
    let renewals = 0;
    const authenticated = client().withAuthentication({
      headers: async () => ({ authorization: "Bearer Rejected-Token-1" }),
      renew: async () => {
        renewals++;
      },
    });

    expect((await authenticated.get("/protected")).status).toBe(401);
    expect(renewals).toBe(1);
    expect(received).toHaveLength(2);
  });

  test("does not renew for other statuses", async () => {
    let renewals = 0;
    const authenticated = client().withAuthentication({
      headers: async () => ({}),
      renew: async () => {
        renewals++;
      },
    });

    expect((await authenticated.get("/status/403")).status).toBe(403);
    expect(renewals).toBe(0);
  });

  test("keeps renewing for clients derived with withHeaders", async () => {
    let token = "Bearer Stale-Token-2";
    const derived = client()
      .withAuthentication({
        headers: async () => ({ authorization: token }),
        renew: async () => {
          token = FRESH_TOKEN;
        },
      })
      .withHeaders({ "X-Extra": "1" });

    expect((await derived.get("/protected")).status).toBe(200);
  });

  test("sends a Secret from the header provider revealed", async () => {
    const authenticated = client().withAuthentication({
      headers: async () => ({ authorization: Secret.of(FRESH_TOKEN) }),
      renew: async () => {},
    });

    expect((await authenticated.get("/protected")).status).toBe(200);
  });

  test("replaces the sign-in of the client it is derived from", async () => {
    let firstCalls = 0;
    let firstRenewals = 0;
    let secondRenewals = 0;
    let token = "Bearer Stale-Token-3";
    const first = client().withAuthentication({
      headers: async () => {
        firstCalls++;
        return { "x-api-key": "First-Key-1" };
      },
      renew: async () => {
        firstRenewals++;
      },
    });
    const second = first.withAuthentication({
      headers: async () => ({ authorization: token }),
      renew: async () => {
        secondRenewals++;
        token = FRESH_TOKEN;
      },
    });

    expect((await second.get("/protected")).status).toBe(200);
    expect(received.every((echo) => echo.headers["x-api-key"] === undefined)).toBe(true);
    expect([firstCalls, firstRenewals, secondRenewals]).toEqual([0, 0, 1]);
  });

  test("sends the sign-in headers over same-named headers from withHeaders", async () => {
    const derived = client()
      .withAuthentication({ headers: async () => ({ authorization: FRESH_TOKEN }), renew: async () => {} })
      .withHeaders({ Authorization: "Bearer Stray-Token-1" });

    expect((await derived.get("/protected")).status).toBe(200);
  });

  test("keeps the headers from withHeaders when the sign-in is replaced", async () => {
    const derived = client()
      .withHeaders({ "X-Extra": "1" })
      .withAuthentication({ headers: async () => ({ authorization: FRESH_TOKEN }), renew: async () => {} });

    expect((await derived.get("/protected")).status).toBe(200);
    expect(received[0]?.headers["x-extra"]).toBe("1");
  });
});

test.describe("HttpClient without authentication", () => {
  test("returns a 401 without resending", async () => {
    expect((await client().get("/protected")).status).toBe(401);
    expect(received).toHaveLength(1);
  });
});

function client(): HttpClient {
  return new HttpClient(context, baseUrl);
}

function handle(incoming: IncomingMessage, outgoing: ServerResponse): void {
  const chunks: Buffer[] = [];
  incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
  incoming.on("end", () => {
    const echo: Echo = {
      method: incoming.method ?? "",
      url: incoming.url ?? "",
      headers: incoming.headers as Record<string, string>,
      body: Buffer.concat(chunks).toString(),
    };
    received.push(echo);
    respond(echo, outgoing);
  });
}

function respond(echo: Echo, outgoing: ServerResponse): void {
  const path = echo.url.split("?")[0] ?? "";
  if (path === "/hang") {
    return;
  }
  if (path === "/redirect") {
    outgoing.writeHead(302, { location: "/echo" }).end();
    return;
  }
  if (path.startsWith("/status/")) {
    outgoing.writeHead(Number(path.slice("/status/".length))).end();
    return;
  }
  if (path === "/protected" && echo.headers["authorization"] !== FRESH_TOKEN) {
    outgoing.writeHead(401).end();
    return;
  }
  outgoing.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(echo));
}
