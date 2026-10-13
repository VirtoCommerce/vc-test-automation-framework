import { test } from "@playwright/test";

import { apiExpect as expect } from "@api/api-matchers";
import { GraphqlError } from "@api/graphql/graphql-error";
import { HttpError } from "@api/http/http-error";
import { MASK, Secret } from "@core/secret";

const NOT_FOUND = new HttpError("GET /api/stores/unknown returned 404", 404);
const INVALID_QUANTITY = new GraphqlError("AddItem", 400, [
  { message: "Quantity must be positive", extensions: { code: "VALIDATION_ERROR" } },
  { message: "Product is unavailable" },
]);

test.describe("toBeHttpError", () => {
  test("passes for an HttpError with the status, also after .rejects", async () => {
    expect(NOT_FOUND).toBeHttpError(404);
    await expect(Promise.reject(NOT_FOUND)).rejects.toBeHttpError(404);
  });

  test("fails for another status, showing the error received", () => {
    expect(() => expect(NOT_FOUND).toBeHttpError(401)).toThrow(
      "Expected HttpError with status 401\nReceived: HttpError: GET /api/stores/unknown returned 404",
    );
  });

  test("fails for an error that is not an HttpError", () => {
    expect(() => expect(INVALID_QUANTITY).toBeHttpError(400)).toThrow("Received: GraphqlError: ");
  });

  test("fails for a value that is not an error", () => {
    expect(() => expect(404).toBeHttpError(404)).toThrow("Received: 404");
  });

  test("with a detail, passes only when the response body quotes it", () => {
    const body = '"Folder name must not be empty"';
    const rejected = new HttpError(`POST /api/assets/folder returned 400: ${body}`, 400, body);

    expect(rejected).toBeHttpError(400, "Folder name must not be empty");
    expect(() => expect(rejected).toBeHttpError(400, "Maximum length is 63")).toThrow(
      'Expected HttpError with status 400 and "Maximum length is 63"',
    );
  });

  test("with a detail, ignores text that only the URL contains", () => {
    const rejected = new HttpError("DELETE /api/assets/folder-name returned 400", 400, "");

    expect(() => expect(rejected).toBeHttpError(400, "folder-name")).toThrow(
      'Expected HttpError with status 400 and "folder-name"',
    );
  });

  test("with .not, passes for another status and fails for the status", () => {
    expect(NOT_FOUND).not.toBeHttpError(401);
    expect(() => expect(NOT_FOUND).not.toBeHttpError(404)).toThrow("Expected not HttpError with status 404");
  });

  test("fails after .rejects when the promise resolves", async () => {
    await expect(expect(Promise.resolve("ok")).rejects.toBeHttpError(404)).rejects.toThrow(
      "Received promise resolved instead of rejected",
    );
  });

  test("masks secret values in what it received", () => {
    const secret = new Secret("expect-matcher-secret-1");
    const leaky = new Error(`token ${secret.reveal()} was refused`);

    expect(() => expect(leaky).toBeHttpError(401)).toThrow(`Received: Error: token ${MASK} was refused`);
  });
});

test.describe("toBeGraphqlError", () => {
  test("passes for a GraphqlError with an error of the code, also after .rejects", async () => {
    expect(INVALID_QUANTITY).toBeGraphqlError("VALIDATION_ERROR");
    await expect(Promise.reject(INVALID_QUANTITY)).rejects.toBeGraphqlError("VALIDATION_ERROR");
  });

  test("passes for any GraphqlError without a code", () => {
    expect(INVALID_QUANTITY).toBeGraphqlError();
  });

  test("fails for another code, showing the errors received", () => {
    expect(() => expect(INVALID_QUANTITY).toBeGraphqlError("UNAUTHORIZED")).toThrow(
      /Expected GraphqlError with code UNAUTHORIZED\nReceived: GraphqlError: .*\[VALIDATION_ERROR\] Quantity must be positive/s,
    );
  });

  test("ignores codes that are not strings", () => {
    const numericCode = new GraphqlError("AddItem", 400, [{ message: "Bad input", extensions: { code: 42 } }]);

    expect(numericCode).not.toBeGraphqlError("42");
  });

  test("fails for an error that is not a GraphqlError", () => {
    expect(() => expect(NOT_FOUND).toBeGraphqlError()).toThrow("Expected GraphqlError\nReceived: HttpError: ");
  });

  test("with .not, passes for another code and fails for the code", () => {
    expect(INVALID_QUANTITY).not.toBeGraphqlError("UNAUTHORIZED");
    expect(() => expect(INVALID_QUANTITY).not.toBeGraphqlError("VALIDATION_ERROR")).toThrow(
      "Expected not GraphqlError with code VALIDATION_ERROR",
    );
  });
});
