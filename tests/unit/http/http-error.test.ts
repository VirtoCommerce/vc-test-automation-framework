import { inspect } from "node:util";

import { expect, test } from "@playwright/test";

import { MASKED, Secret } from "@/core";
import { HttpError } from "@/http";

test.describe("HttpError", () => {
  test("is an Error with the name HttpError", () => {
    const error = new HttpError("GET /api/stores → 404 Not Found", 404);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(HttpError);
    expect(error.name).toBe("HttpError");
  });

  test("keeps the message, status and body", () => {
    const error = new HttpError("POST /api/orders → 400 Bad Request", 400, '{"message":"Invalid order"}');

    expect(error.message).toBe("POST /api/orders → 400 Bad Request");
    expect(error.status).toBe(400);
    expect(error.body).toBe('{"message":"Invalid order"}');
  });

  test("has an empty body by default", () => {
    expect(new HttpError("GET /api/stores → 500 Internal Server Error", 500).body).toBe("");
  });

  test("keeps the cause", () => {
    const cause = new Error("socket hang up");

    expect(new HttpError("GET /api/stores → 0", 0, "", { cause }).cause).toBe(cause);
  });

  test("names itself in its string form and stack", () => {
    const error = new HttpError("GET /api/stores → 404 Not Found", 404);

    expect(String(error)).toBe("HttpError: GET /api/stores → 404 Not Found");
    expect(error.stack).toMatch(/^HttpError: GET \/api\/stores → 404 Not Found/);
  });

  test("masks a registered secret in the message", () => {
    Secret.of("Http-Message-Secret-1");

    const error = new HttpError("GET /api/users/Http-Message-Secret-1 → 404 Not Found", 404);

    expect(error.message).toBe(`GET /api/users/${MASKED} → 404 Not Found`);
  });

  test("masks a registered secret in the body", () => {
    Secret.of("Http Body Secret!1");

    const error = new HttpError(
      "POST /connect/token → 400 Bad Request",
      400,
      "grant_type=password&password=Http+Body+Secret%211",
    );

    expect(error.body).toBe(`grant_type=password&password=${MASKED}`);
  });

  test("keeps a registered secret out of every printed form", () => {
    Secret.of("Http-Printed-Secret-1");

    const error = new HttpError("GET /Http-Printed-Secret-1 → 401 Unauthorized", 401, "token=Http-Printed-Secret-1");

    expect(String(error)).not.toContain("Http-Printed-Secret-1");
    expect(error.stack).not.toContain("Http-Printed-Secret-1");
    expect(inspect(error)).not.toContain("Http-Printed-Secret-1");
  });

  test("keeps a message and body without registered secrets unchanged", () => {
    const error = new HttpError("GET /api/catalog/products → 503 Service Unavailable", 503, "Service Unavailable");

    expect(error.message).toBe("GET /api/catalog/products → 503 Service Unavailable");
    expect(error.body).toBe("Service Unavailable");
  });
});

test.describe("HttpError.hasStatus", () => {
  const NOT_FOUND = new HttpError("GET /api/stores/missing → 404 Not Found", 404, "Not Found");
  const CASES = [
    { title: "an HttpError with the status", error: NOT_FOUND, statuses: [404], expected: true },
    { title: "an HttpError with one of the statuses", error: NOT_FOUND, statuses: [400, 404, 409], expected: true },
    { title: "an HttpError with another status", error: NOT_FOUND, statuses: [400, 500], expected: false },
    { title: "an HttpError when no status is given", error: NOT_FOUND, statuses: [], expected: false },
    { title: "a plain Error", error: new Error("404 Not Found"), statuses: [404], expected: false },
    {
      title: "an object shaped like an HttpError",
      error: { name: "HttpError", status: 404 },
      statuses: [404],
      expected: false,
    },
    { title: "a string", error: "404", statuses: [404], expected: false },
    { title: "undefined", error: undefined, statuses: [404], expected: false },
    { title: "null", error: null, statuses: [404], expected: false },
  ];

  for (const { title, error, statuses, expected } of CASES) {
    test(`returns ${expected} for ${title}`, () => {
      expect(HttpError.hasStatus(error, ...statuses)).toBe(expected);
    });
  }

  test("narrows an unknown value to HttpError", () => {
    const caught: unknown = NOT_FOUND;

    expect(HttpError.hasStatus(caught, 404) && caught.body).toBe("Not Found");
  });
});
