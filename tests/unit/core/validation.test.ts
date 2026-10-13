import { expect, test } from "@playwright/test";
import { object } from "zod";

import { Secret } from "@core/secret";
import { nonEmptyString, originUrl, parseOrThrow, positiveInt, secretString, urlPath, webUrl } from "@core/validation";

test.describe("nonEmptyString", () => {
  test("keeps the surrounding spaces of a value", () => {
    expect(nonEmptyString.parse(" pass word ")).toBe(" pass word ");
  });

  for (const value of ["", "   ", "\t\n"]) {
    test(`rejects ${JSON.stringify(value)}`, () => {
      expect(nonEmptyString.safeParse(value).success).toBe(false);
    });
  }
});

test.describe("webUrl", () => {
  for (const value of ["http://localhost:8090", "https://frontend.example.com/path"]) {
    test(`accepts ${value}`, () => {
      expect(webUrl.parse(value)).toBe(value);
    });
  }

  for (const value of ["", "localhost:8090", "ftp://example.com", "/relative"]) {
    test(`rejects ${JSON.stringify(value)}`, () => {
      expect(webUrl.safeParse(value).success).toBe(false);
    });
  }

  for (const value of ["http://admin:password@localhost:8090", "https://token@frontend.example.com"]) {
    test(`rejects credentials in ${value.replace(/\/\/.*@/, "//…@")}`, () => {
      const result = webUrl.safeParse(value);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe("must not contain credentials");
    });
  }
});

test.describe("originUrl", () => {
  for (const value of ["http://localhost:8090", "http://localhost:8090/", "https://frontend.example.com"]) {
    test(`accepts ${value}`, () => {
      expect(originUrl.parse(value)).toBe(value);
    });
  }

  for (const value of [
    "http://localhost/platform",
    "http://localhost/platform/",
    "http://localhost/?store=acme",
    "http://localhost/#home",
  ]) {
    test(`rejects ${value}`, () => {
      const result = originUrl.safeParse(value);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toContain("must be an origin");
    });
  }

  for (const value of ["http://admin:password@localhost:8090", "ftp://localhost", "localhost:8090"]) {
    test(`rejects what webUrl rejects: ${value.replace(/\/\/.*@/, "//…@")}`, () => {
      expect(originUrl.safeParse(value).success).toBe(false);
    });
  }
});

test.describe("urlPath", () => {
  for (const value of ["/", "/apps/page-builder-shell/"]) {
    test(`accepts ${value}`, () => {
      expect(urlPath.parse(value)).toBe(value);
    });
  }

  for (const value of ["", "apps/page-builder-shell/", "http://localhost/apps"]) {
    test(`rejects ${JSON.stringify(value)}`, () => {
      expect(urlPath.safeParse(value).success).toBe(false);
    });
  }
});

test.describe("positiveInt", () => {
  test("coerces a numeric string", () => {
    expect(positiveInt.parse("5000")).toBe(5000);
  });

  for (const value of ["0", "-1", "1.5", "abc", ""]) {
    test(`rejects ${JSON.stringify(value)}`, () => {
      expect(positiveInt.safeParse(value).success).toBe(false);
    });
  }
});

test.describe("secretString", () => {
  test("wraps the value in a Secret", () => {
    const parsed = secretString.parse("validation-secret-1");

    expect(parsed).toBeInstanceOf(Secret);
    expect(parsed.reveal()).toBe("validation-secret-1");
  });

  test("rejects a blank value", () => {
    expect(secretString.safeParse("  ").success).toBe(false);
  });
});

test.describe("parseOrThrow", () => {
  const Schema = object({ name: nonEmptyString, size: positiveInt.default(1) });

  test("returns the parsed value with defaults applied", () => {
    expect(parseOrThrow(Schema, { name: "laptop" }, "Invalid item")).toEqual({ name: "laptop", size: 1 });
  });

  test("throws with the label and every issue", () => {
    expect(() => parseOrThrow(Schema, { name: " ", size: "0" }, "Invalid item")).toThrow(
      /^Invalid item:\n[\s\S]*must not be blank[\s\S]*→ at name[\s\S]*→ at size/,
    );
  });
});
