import type { HttpResponseInit } from "@api/http/http-response";

import { expect, test } from "@playwright/test";
import { array, number, object, string } from "zod";

import { HttpError } from "@api/http/http-error";
import { HttpResponse } from "@api/http/http-response";
import { shape } from "@core/record-shape";
import { MASK, Secret } from "@core/secret";

const URL = "http://localhost/api/catalog/products/laptop";

function response(init: Partial<HttpResponseInit> = {}): HttpResponse {
  return new HttpResponse({
    method: "GET",
    url: URL,
    status: 200,
    statusText: "OK",
    headers: {},
    text: "",
    ...init,
  });
}

function caught(action: () => unknown): HttpError {
  try {
    action();
  } catch (error) {
    if (error instanceof HttpError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected an HttpError");
}

const FAILED = { status: 500, statusText: "Internal Server Error", text: '{"message":"boom"}' } as const;

test.describe("HttpResponse", () => {
  test.describe("ok", () => {
    for (const status of [200, 201, 204, 299]) {
      test(`is true for ${status}`, () => {
        expect(response({ status }).ok).toBe(true);
      });
    }

    for (const status of [199, 300, 302, 400, 404, 500]) {
      test(`is false for ${status}`, () => {
        expect(response({ status }).ok).toBe(false);
      });
    }
  });

  test("reads a header whatever the letter case", () => {
    const received = response({ headers: { "Content-Type": "application/json" } });

    expect(received.header("content-type")).toBe("application/json");
    expect(received.header("CONTENT-TYPE")).toBe("application/json");
    expect(received.headers).toEqual({ "content-type": "application/json" });
    expect(received.header("X-Missing")).toBeUndefined();
  });

  test.describe("expectOk", () => {
    test("returns the response for a success", () => {
      const received = response();

      expect(received.expectOk()).toBe(received);
    });

    test("throws an HttpError with the request, status and body for a failure", () => {
      const error = caught(() => response(FAILED).expectOk());

      expect(error.status).toBe(500);
      expect(error.message).toBe(`GET ${URL} → 500 Internal Server Error\n{"message":"boom"}`);
    });

    test("leaves out an empty status text and body", () => {
      const error = caught(() => response({ status: 404, statusText: "" }).expectOk());

      expect(error.message).toBe(`GET ${URL} → 404`);
    });

    test("cuts a long body to the first 1000 characters", () => {
      const error = caught(() => response({ status: 500, text: `${"a".repeat(1000)}${"b".repeat(500)}` }).expectOk());

      expect(error.message).toContain(`${"a".repeat(1000)}... (1500 chars)`);
      expect(error.message).not.toContain("b");
    });

    test("masks known secrets in the body", () => {
      const token = new Secret("http-response-token-1");

      const error = caught(() => response({ status: 500, text: `{"access_token":"${token.reveal()}"}` }).expectOk());

      expect(error.message).toContain(`{"access_token":"${MASK}"}`);
      expect(error.message).not.toContain(token.reveal());
    });

    test("masks a secret before cutting the body, so no part of it is left at the cut", () => {
      const token = new Secret("http-response-cut-token-1");
      const text = `${"a".repeat(990)}${token.reveal()}${"b".repeat(500)}`;

      const error = caught(() => response({ status: 500, text }).expectOk());

      expect(error.message).toContain(`${"a".repeat(990)}${MASK}`);
      expect(error.message).not.toContain("http-res");
      expect(error.message).toContain(`... (${text.length} chars)`);
    });
  });

  test.describe("json", () => {
    test("returns the parsed body of a success", () => {
      expect(response({ text: '{"id":"laptop"}' }).json()).toEqual({ id: "laptop" });
    });

    test("throws for a failure instead of parsing its body", () => {
      expect(caught(() => response(FAILED).json()).status).toBe(500);
    });

    test("throws for a body that is not JSON", () => {
      const error = caught(() => response({ text: "<html>" }).json());

      expect(error.message).toContain(`GET ${URL} → 200 OK: response body is not valid JSON (`);
      expect(error.message).toContain("<html>");
    });
  });

  test.describe("optionalJson", () => {
    test("returns the parsed body", () => {
      expect(response({ text: '{"id":"laptop"}' }).optionalJson()).toEqual({ id: "laptop" });
    });

    for (const [title, init] of [
      ["204 No Content", { status: 204, statusText: "No Content" }],
      ["an empty body", { text: "" }],
      ["a null body", { text: "null" }],
    ] as const) {
      test(`returns undefined for ${title}`, () => {
        expect(response(init).optionalJson()).toBeUndefined();
      });
    }

    test("throws for a 404", () => {
      expect(caught(() => response({ status: 404, statusText: "Not Found" }).optionalJson()).status).toBe(404);
    });

    test("returns undefined for a 404 when the endpoint answers a missing record with 404", () => {
      expect(response({ status: 404, statusText: "Not Found" }).optionalJson({ allow404: true })).toBeUndefined();
    });

    test("still throws for another failure when 404 is allowed", () => {
      expect(caught(() => response(FAILED).optionalJson({ allow404: true })).status).toBe(500);
    });

    test("still parses a found record when 404 is allowed", () => {
      expect(response({ text: '{"id":"laptop"}' }).optionalJson({ allow404: true })).toEqual({ id: "laptop" });
    });

    test("throws for a body that is not JSON", () => {
      expect(caught(() => response({ text: "not json" }).optionalJson()).message).toContain("not valid JSON");
    });
  });

  test.describe("record shapes", () => {
    const PRODUCT = shape<{ id?: string | null; name?: string | null; code?: string }>()("Product", ["id", "name"]);

    test("record returns a record with the shape's fields", () => {
      expect(response({ text: '{"id":"laptop","name":"Laptop"}' }).record(PRODUCT)).toEqual({
        id: "laptop",
        name: "Laptop",
      });
    });

    test("record names the shape and the request when a field is missing", () => {
      expect(() => response({ method: "POST", text: '{"id":"laptop"}' }).record(PRODUCT)).toThrow(
        "Product from POST /api/catalog/products/laptop has no name",
      );
    });

    test("record throws for an empty body", () => {
      expect(() => response({ text: "null" }).record(PRODUCT)).toThrow(
        "Product from GET /api/catalog/products/laptop is missing",
      );
    });

    test("optionalRecord returns undefined for nothing found, and checks a found record", () => {
      expect(response({ text: "" }).optionalRecord(PRODUCT)).toBeUndefined();
      expect(
        response({ status: 404, statusText: "Not Found" }).optionalRecord(PRODUCT, { allow404: true }),
      ).toBeUndefined();
      expect(() => response({ text: '{"name":"Laptop"}' }).optionalRecord(PRODUCT)).toThrow("has no id");
    });

    test("records checks every item of a JSON array, naming a bad one by position", () => {
      expect(response({ text: '[{"id":"a","name":"A"}]' }).records(PRODUCT)).toEqual([{ id: "a", name: "A" }]);
      expect(() => response({ text: '[{"id":"a","name":"A"},{"id":"b"}]' }).records(PRODUCT)).toThrow(
        "Product from GET /api/catalog/products/laptop #2 has no name",
      );
    });

    test("results checks the results of a search result", () => {
      expect(response({ text: '{"totalCount":1,"results":[{"id":"a","name":"A"}]}' }).results(PRODUCT)).toEqual([
        { id: "a", name: "A" },
      ]);
      expect(() => response({ text: '{"totalCount":0}' }).results(PRODUCT)).toThrow("is missing");
    });

    test("still requires a 2xx status", () => {
      expect(caught(() => response(FAILED).record(PRODUCT)).status).toBe(500);
    });
  });

  test.describe("parse", () => {
    const Product = object({ id: string(), quantity: number().default(1) });

    test("returns the checked body with defaults applied", () => {
      expect(response({ text: '{"id":"laptop"}' }).parse(Product)).toEqual({ id: "laptop", quantity: 1 });
    });

    test("throws for a failure even when its body matches the schema", () => {
      const error = caught(() => response({ ...FAILED, text: '{"id":"laptop"}' }).parse(Product));

      expect(error.status).toBe(500);
      expect(error.message).not.toContain("unexpected response body");
    });

    test("throws with every issue when the body does not match", () => {
      const error = caught(() => response({ text: '{"quantity":"two"}' }).parse(Product));

      expect(error.message).toMatch(/^GET \S+ → 200 OK: unexpected response body:\n[\s\S]*→ at id[\s\S]*→ at quantity/);
    });

    test("throws for a body that is not JSON", () => {
      expect(caught(() => response({ text: "" }).parse(Product)).message).toContain("not valid JSON");
    });
  });

  test.describe("errorJson", () => {
    test("returns the parsed body of a rejected request", () => {
      const received = response({ status: 400, statusText: "Bad Request", text: '{"errors":["name is required"]}' });

      expect(received.errorJson()).toEqual({ errors: ["name is required"] });
    });

    test("throws for a success", () => {
      const error = caught(() => response({ text: '{"id":"laptop"}' }).errorJson());

      expect(error.status).toBe(200);
      expect(error.message).toContain(`GET ${URL} → 200 OK: expected an error response`);
    });

    test("throws for an error body that is not JSON", () => {
      expect(caught(() => response({ status: 502, text: "Bad Gateway" }).errorJson()).message).toContain(
        "not valid JSON",
      );
    });
  });

  test.describe("parseError", () => {
    const Rejection = object({ errors: array(string()), code: number().default(0) });

    test("returns the checked error body with defaults applied", () => {
      const received = response({ status: 400, statusText: "Bad Request", text: '{"errors":["name is required"]}' });

      expect(received.parseError(Rejection)).toEqual({ errors: ["name is required"], code: 0 });
    });

    test("throws for a success", () => {
      const error = caught(() => response({ text: '{"errors":[]}' }).parseError(Rejection));

      expect(error.message).toContain("expected an error response");
    });

    test("throws with every issue when the error body does not match", () => {
      const error = caught(() => response({ status: 400, text: '{"errors":"oops"}' }).parseError(Rejection));

      expect(error.status).toBe(400);
      expect(error.message).toMatch(/→ 400 OK: unexpected response body:\n[\s\S]*→ at errors/);
    });

    test("throws for an error body that is not JSON", () => {
      expect(caught(() => response({ status: 502, text: "<html>" }).parseError(Rejection)).message).toContain(
        "not valid JSON",
      );
    });
  });
});
