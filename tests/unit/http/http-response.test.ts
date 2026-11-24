import type { HttpResponseInit } from "@/http";

import { expect, test } from "@playwright/test";
import { number, object, string } from "zod";

import { MASKED, Secret } from "@/core";
import { HttpError, HttpResponse } from "@/http";

const BASE: HttpResponseInit = {
  method: "GET",
  url: "http://localhost:8090/api/stores/store-1",
  status: 200,
  statusText: "OK",
  headers: { "content-type": "application/json" },
  text: '{"id":"store-1"}',
};

const NOT_FOUND: HttpResponseInit = { ...BASE, status: 404, statusText: "Not Found", text: '{"message":"No store"}' };

const STORE = object({ id: string(), count: number().default(0) }).transform((store) => ({
  ...store,
  label: store.id.toUpperCase(),
}));

test.describe("HttpResponse", () => {
  test("keeps what it is built from", () => {
    const response = new HttpResponse(BASE);

    expect(response).toMatchObject(BASE);
  });

  const STATUSES = [
    { status: 199, ok: false },
    { status: 200, ok: true },
    { status: 204, ok: true },
    { status: 299, ok: true },
    { status: 300, ok: false },
    { status: 404, ok: false },
    { status: 500, ok: false },
  ];

  for (const { status, ok } of STATUSES) {
    test(`ok is ${ok} for status ${status}`, () => {
      expect(new HttpResponse({ ...BASE, status }).ok).toBe(ok);
    });
  }
});

test.describe("HttpResponse.toError", () => {
  test("describes a success response with a reason, without the query", () => {
    const response = new HttpResponse({ ...BASE, url: `${BASE.url}?expand=all`, text: '{"succeeded":false}' });

    const error = response.toError("the platform refused the record");

    expect(error).toBeInstanceOf(HttpError);
    expect(error.message).toBe(
      'GET http://localhost:8090/api/stores/store-1 → 200 OK: the platform refused the record\n{"succeeded":false}',
    );
    expect(error.status).toBe(200);
  });

  test("shortens a long body", () => {
    const error = new HttpResponse({ ...BASE, text: "x".repeat(1_500) }).toError("too long");

    expect(error.message).toContain(`${"x".repeat(1_000)}... (1500 chars)`);
    expect(error.body).toHaveLength(1_500);
  });
});

test.describe("HttpResponse.expectOk", () => {
  test("returns the response for a 2xx status", () => {
    const response = new HttpResponse({ ...BASE, status: 204, statusText: "No Content", text: "" });

    expect(response.expectOk()).toBe(response);
  });

  test("throws an HttpError with the status and body for a non-2xx status", () => {
    const response = new HttpResponse(NOT_FOUND);

    expect(() => response.expectOk()).toThrow(HttpError);
    expect(() => response.expectOk()).toThrow(expect.objectContaining({ status: 404, body: '{"message":"No store"}' }));
  });

  test("names the request and status, then quotes the body", () => {
    expect(() => new HttpResponse(NOT_FOUND).expectOk()).toThrow(
      'GET http://localhost:8090/api/stores/store-1 → 404 Not Found\n{"message":"No store"}',
    );
  });
});

test.describe("HttpResponse.json", () => {
  test("returns a 2xx body as JSON", () => {
    expect(new HttpResponse(BASE).json()).toEqual({ id: "store-1" });
  });

  test("throws for a non-2xx status", () => {
    expect(() => new HttpResponse(NOT_FOUND).json()).toThrow("→ 404 Not Found");
  });

  test("throws for a 2xx body that is not JSON", () => {
    const response = new HttpResponse({ ...BASE, text: "<html>Maintenance</html>" });

    expect(() => response.json()).toThrow(HttpError);
    expect(() => response.json()).toThrow("response body is not valid JSON");
    expect(() => response.json()).toThrow("<html>Maintenance</html>");
  });
});

test.describe("HttpResponse.parse", () => {
  test("returns a 2xx body validated by the schema, with defaults and transforms", () => {
    expect(new HttpResponse(BASE).parse(STORE)).toEqual({ id: "store-1", count: 0, label: "STORE-1" });
  });

  test("throws listing every issue for a body that fails the schema", () => {
    const response = new HttpResponse({ ...BASE, text: '{"id":1,"count":"many"}' });

    expect(() => response.parse(STORE)).toThrow(HttpError);
    expect(() => response.parse(STORE)).toThrow("unexpected response body");
    expect(() => response.parse(STORE)).toThrow("→ at id");
    expect(() => response.parse(STORE)).toThrow("→ at count");
  });

  test("throws for a non-2xx status", () => {
    expect(() => new HttpResponse(NOT_FOUND).parse(STORE)).toThrow("→ 404 Not Found");
  });

  test("throws for a 2xx body that is not JSON", () => {
    expect(() => new HttpResponse({ ...BASE, text: "" }).parse(STORE)).toThrow("response body is not valid JSON");
  });
});

test.describe("HttpResponse.parseOptional", () => {
  for (const text of ["", "null"]) {
    test(`returns undefined for a 2xx body of ${JSON.stringify(text)}`, () => {
      expect(new HttpResponse({ ...BASE, text }).parseOptional(STORE)).toBeUndefined();
    });
  }

  test("returns a 2xx body validated by the schema", () => {
    expect(new HttpResponse(BASE).parseOptional(STORE)).toEqual({ id: "store-1", count: 0, label: "STORE-1" });
  });

  test("throws for a 404 status", () => {
    expect(() => new HttpResponse({ ...NOT_FOUND, text: "" }).parseOptional(STORE)).toThrow("→ 404 Not Found");
  });

  test("returns undefined for a 404 status with allow404", () => {
    expect(new HttpResponse(NOT_FOUND).parseOptional(STORE, { allow404: true })).toBeUndefined();
  });

  test("throws for a body that fails the schema", () => {
    expect(() => new HttpResponse({ ...BASE, text: "{}" }).parseOptional(STORE)).toThrow("unexpected response body");
  });
});

test.describe("HttpResponse.optionalJson", () => {
  for (const text of ["", "null"]) {
    test(`returns undefined for a 2xx body of ${JSON.stringify(text)}`, () => {
      expect(new HttpResponse({ ...BASE, text }).optionalJson()).toBeUndefined();
    });
  }

  test("returns a 2xx body parsed as JSON", () => {
    expect(new HttpResponse(BASE).optionalJson()).toEqual(JSON.parse(BASE.text));
  });

  test("throws for a 404 status", () => {
    expect(() => new HttpResponse(NOT_FOUND).optionalJson()).toThrow("→ 404 Not Found");
  });

  test("returns undefined for a 404 status with allow404", () => {
    expect(new HttpResponse(NOT_FOUND).optionalJson({ allow404: true })).toBeUndefined();
  });

  test("throws for another error status with allow404", () => {
    const failed = new HttpResponse({ ...BASE, status: 500, statusText: "Internal Server Error", text: "" });
    expect(() => failed.optionalJson({ allow404: true })).toThrow("→ 500 Internal Server Error");
  });
});

test.describe("HttpResponse.errorJson", () => {
  test("returns a non-2xx body as JSON", () => {
    expect(new HttpResponse(NOT_FOUND).errorJson()).toEqual({ message: "No store" });
  });

  test("throws for a 2xx status", () => {
    expect(() => new HttpResponse(BASE).errorJson()).toThrow(HttpError);
    expect(() => new HttpResponse(BASE).errorJson()).toThrow("expected an error response");
  });

  test("throws for a non-2xx body that is not JSON", () => {
    const response = new HttpResponse({ ...NOT_FOUND, text: "Not Found" });

    expect(() => response.errorJson()).toThrow("response body is not valid JSON");
  });
});

test.describe("HttpResponse errors", () => {
  test("leave the query and fragment out of the URL", () => {
    const response = new HttpResponse({ ...NOT_FOUND, url: "http://localhost:8090/api/stores?api_key=k1#top" });

    expect(() => response.expectOk()).toThrow(/^GET http:\/\/localhost:8090\/api\/stores → 404 Not Found\n/);
  });

  test("leave the query out of a URL that is not absolute", () => {
    const response = new HttpResponse({ ...NOT_FOUND, url: "/api/stores?api_key=k2" });

    expect(() => response.expectOk()).toThrow(/^GET \/api\/stores → 404 Not Found\n/);
  });

  test("end the summary at the status when there is no status text", () => {
    const response = new HttpResponse({ ...NOT_FOUND, statusText: "" });

    expect(() => response.expectOk()).toThrow(/^GET \S+ → 404\n/);
  });

  test("have no body line when the body is empty", () => {
    const response = new HttpResponse({ ...NOT_FOUND, text: "" });

    expect(() => response.expectOk()).toThrow(/^GET \S+ → 404 Not Found$/);
  });

  test("shorten a body longer than 1000 characters in the message", () => {
    const text = "x".repeat(1_500);
    const response = new HttpResponse({ ...NOT_FOUND, text });

    expect(() => response.expectOk()).toThrow(`\n${"x".repeat(1_000)}... (1500 chars)`);
    expect(() => response.expectOk()).toThrow(expect.objectContaining({ body: text }));
  });

  test("mask registered secrets in the message and body", () => {
    Secret.of("Response-Secret-1");
    const response = new HttpResponse({ ...NOT_FOUND, text: '{"token":"Response-Secret-1"}' });

    expect(() => response.expectOk()).toThrow(`{"token":"${MASKED}"}`);
    expect(() => response.expectOk()).toThrow(expect.objectContaining({ body: `{"token":"${MASKED}"}` }));
  });

  test("keep a registered secret that starts a body that is not JSON out of the message and cause", () => {
    Secret.of("Leaky-Secret-1");
    const response = new HttpResponse({ ...BASE, text: "Leaky-Secret-1 is not JSON" });

    const error = catchError(() => response.json());

    expect(error).toBeInstanceOf(HttpError);
    expect(error.message).toContain(`\n${MASKED} is not JSON`);
    expect(error.message).not.toContain("Leaky-Secr");
    expect(error.cause).toBeUndefined();
  });
});

function catchError(action: () => unknown): Error {
  try {
    action();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw error;
  }
  throw new Error("expected the action to throw");
}
