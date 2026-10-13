import { test } from "@playwright/test";

import { HttpError } from "@api/http/http-error";
import { expect } from "@fixtures";

test.describe("@fixtures", () => {
  test("exports an expect with the api layer's matchers", async () => {
    const notFound = new HttpError("GET /api/stores/unknown returned 404", 404);

    await expect(Promise.reject(notFound)).rejects.toBeHttpError(404);
  });
});
