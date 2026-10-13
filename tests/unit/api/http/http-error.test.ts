import { expect, test } from "@playwright/test";

import { HttpError } from "@api/http/http-error";
import { MASK, Secret } from "@core/secret";

test.describe("HttpError", () => {
  test("is an Error with its name, message and status", () => {
    const error = new HttpError("GET http://localhost/api/x → 404 Not Found", 404);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(HttpError);
    expect(error.name).toBe("HttpError");
    expect(error.message).toBe("GET http://localhost/api/x → 404 Not Found");
    expect(error.status).toBe(404);
    expect(String(error)).toBe("HttpError: GET http://localhost/api/x → 404 Not Found");
  });

  test.describe("masking", () => {
    const token = new Secret("http-error-token-1");
    const message = `POST http://localhost/connect/token → 500\n{"access_token":"${token.reveal()}"}`;

    test("masks known secrets in the message", () => {
      const error = new HttpError(message, 500);

      expect(error.message).toBe(`POST http://localhost/connect/token → 500\n{"access_token":"${MASK}"}`);
    });

    test("masks known secrets in the stack trace", () => {
      const error = new HttpError(message, 500);

      expect(error.stack).toContain("HttpError: POST http://localhost/connect/token → 500");
      expect(error.stack).not.toContain(token.reveal());
    });

    test("keeps a message without secrets unchanged", () => {
      const plain = "GET http://localhost/api/catalog/products?keyword=laptop → 503 Service Unavailable";

      expect(new HttpError(plain, 503).message).toBe(plain);
    });
  });

  test.describe("isClientError", () => {
    for (const status of [400, 401, 404, 499]) {
      test(`is true for ${status}`, () => {
        expect(HttpError.isClientError(new HttpError("failed", status))).toBe(true);
      });
    }

    for (const status of [200, 399, 500, 503]) {
      test(`is false for ${status}`, () => {
        expect(HttpError.isClientError(new HttpError("failed", status))).toBe(false);
      });
    }

    for (const [title, value] of [
      ["a plain Error", new Error("failed")],
      ["an object that looks like an HttpError", { name: "HttpError", status: 404 }],
      ["a string", "404"],
      ["undefined", undefined],
    ] as const) {
      test(`is false for ${title}`, () => {
        expect(HttpError.isClientError(value)).toBe(false);
      });
    }

    test("narrows an unknown value so its status can be read", () => {
      const caught: unknown = new HttpError("failed", 409);

      const status = HttpError.isClientError(caught) ? caught.status : undefined;

      expect(status).toBe(409);
    });
  });

  test.describe("hasStatus", () => {
    test("is true for the given status", () => {
      expect(HttpError.hasStatus(new HttpError("failed", 404), 404)).toBe(true);
    });

    test("is true for one of several given statuses", () => {
      expect(HttpError.hasStatus(new HttpError("failed", 409), 404, 409)).toBe(true);
    });

    test("is false for another status", () => {
      expect(HttpError.hasStatus(new HttpError("failed", 500), 404, 409)).toBe(false);
    });

    test("is false when no status is given", () => {
      expect(HttpError.hasStatus(new HttpError("failed", 500))).toBe(false);
    });

    test("is false for an object that looks like an HttpError", () => {
      expect(HttpError.hasStatus({ name: "HttpError", status: 404 }, 404)).toBe(false);
    });
  });
});
