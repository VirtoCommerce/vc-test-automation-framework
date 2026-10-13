import { inspect } from "node:util";

import { expect, test } from "@playwright/test";

import { deepFreeze } from "@core/deep-freeze";
import { MASK, Secret } from "@core/secret";

test.describe("Secret", () => {
  test("reveals the plain value", () => {
    expect(new Secret("secret-reveal-1").reveal()).toBe("secret-reveal-1");
  });

  test.describe("printing", () => {
    const secret = new Secret("secret-printed-1");

    test("converts to the mask as a string", () => {
      expect(String(secret)).toBe(MASK);
      expect(`password: ${secret}`).toBe(`password: ${MASK}`);
    });

    test("serializes to the mask, also inside other objects", () => {
      expect(JSON.stringify({ admin: { password: secret } })).toBe(`{"admin":{"password":"${MASK}"}}`);
    });

    test("inspects to the mask, as console.log shows it", () => {
      expect(inspect({ password: secret })).toBe(`{ password: ${MASK} }`);
    });

    test("has no enumerable fields to copy the value from", () => {
      expect(Object.keys(secret)).toEqual([]);
      expect({ ...secret }).toEqual({});
    });
  });

  test("compares by value without revealing", () => {
    expect(new Secret("secret-equal-1").equals(new Secret("secret-equal-1"))).toBe(true);
    expect(new Secret("secret-equal-1").equals(new Secret("secret-other-1"))).toBe(false);
  });

  test("keeps working when frozen", () => {
    const { password } = deepFreeze({ password: new Secret("secret-frozen-1") });

    expect(password.reveal()).toBe("secret-frozen-1");
    expect(String(password)).toBe(MASK);
  });

  test.describe("mask", () => {
    test("replaces every occurrence of a known value", () => {
      new Secret("secret-known-1");

      expect(Secret.mask("a secret-known-1 b secret-known-1")).toBe(`a ${MASK} b ${MASK}`);
    });

    test("replaces values known from any secret created before", () => {
      const created = [new Secret("secret-first-1"), new Secret("secret-second-1")];

      expect(Secret.mask("secret-first-1 secret-second-1")).toBe(`${MASK} ${MASK}`);
      expect(created.map((secret) => secret.reveal())).toEqual(["secret-first-1", "secret-second-1"]);
    });

    test("replaces the form-encoded value, as sent in a form body or a query string", () => {
      const password = new Secret("Secret Form (1)!&*'~");
      const body = new URLSearchParams({ grant_type: "password", password: password.reveal(), scope: "x" });

      expect(Secret.mask(body.toString())).toBe(`grant_type=password&password=${MASK}&scope=x`);
    });

    test("replaces the URL-encoded value, as sent in a URL path", () => {
      const userName = new Secret("Secret Path (1)!&");

      expect(Secret.mask(`/api/users/${encodeURIComponent(userName.reveal())}/lock`)).toBe(`/api/users/${MASK}/lock`);
    });

    test("replaces the JSON-escaped value, as sent in a body", () => {
      new Secret('Secret"Json\\1');

      expect(Secret.mask('{"password":"Secret\\"Json\\\\1"}')).toBe(`{"password":"${MASK}"}`);
    });

    test("replaces a longer value before a shorter one it contains", () => {
      new Secret("secret-nested");
      new Secret("secret-nested-longer");

      expect(Secret.mask("token secret-nested-longer")).toBe(`token ${MASK}`);
    });

    test("masks a value at the four-character minimum", () => {
      new Secret("q7#z");

      expect(Secret.mask("pin q7#z")).toBe(`pin ${MASK}`);
    });

    test("does not remember values shorter than four characters", () => {
      new Secret("");
      new Secret("x9!");

      expect(Secret.mask("x9! and an empty key")).toBe("x9! and an empty key");
    });

    test("keeps text without known values unchanged", () => {
      const text = "GET http://localhost/api/catalog/products → 503 Service Unavailable";

      expect(Secret.mask(text)).toBe(text);
    });
  });
});
