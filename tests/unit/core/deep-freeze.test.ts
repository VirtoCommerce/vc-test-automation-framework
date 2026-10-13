import { expect, test } from "@playwright/test";

import { deepFreeze } from "@core/deep-freeze";
import { Secret } from "@core/secret";

test.describe("deepFreeze", () => {
  test("returns the same object, frozen", () => {
    const config = { name: "acme" };

    const frozen = deepFreeze(config);

    expect(frozen).toBe(config);
    expect(Object.isFrozen(config)).toBe(true);
  });

  test("freezes nested objects and arrays", () => {
    const config = deepFreeze({ admin: { roles: [{ id: "role-store-admin" }] } });

    expect(Object.isFrozen(config.admin)).toBe(true);
    expect(Object.isFrozen(config.admin.roles)).toBe(true);
    expect(Object.isFrozen(config.admin.roles[0])).toBe(true);
  });

  test("makes assignments throw", () => {
    const config = deepFreeze({ admin: { username: "admin" }, items: ["a"] });

    expect(() => {
      (config.admin as { username: string }).username = "other";
    }).toThrow(TypeError);
    expect(() => {
      (config.items as string[]).push("b");
    }).toThrow(TypeError);
  });

  for (const [title, value] of [
    ["a string", "text"],
    ["a number", 42],
    ["a boolean", true],
    ["null", null],
    ["undefined", undefined],
  ] as const) {
    test(`returns ${title} unchanged`, () => {
      expect(deepFreeze(value)).toBe(value);
    });
  }

  test("leaves functions unfrozen", () => {
    const callback = () => "called";

    const config = deepFreeze({ callback });

    expect(config.callback).toBe(callback);
    expect(Object.isFrozen(callback)).toBe(false);
  });

  test("handles circular references", () => {
    const node: { name: string; self?: unknown } = { name: "loop" };
    node.self = node;

    expect(() => deepFreeze(node)).not.toThrow();
    expect(Object.isFrozen(node)).toBe(true);
  });

  test("freezes an object reachable twice once", () => {
    const shared = { id: "shared" };

    const config = deepFreeze({ first: shared, second: shared });

    expect(config.first).toBe(config.second);
    expect(Object.isFrozen(shared)).toBe(true);
  });

  test("does not follow symbol-keyed properties", () => {
    const hidden = { value: 1 };
    const key = Symbol("hidden");

    deepFreeze({ [key]: hidden });

    expect(Object.isFrozen(hidden)).toBe(false);
  });

  test("does not freeze the contents of a Map", () => {
    const map = deepFreeze(new Map([["a", 1]]));

    (map as Map<string, number>).set("b", 2);

    expect(Object.isFrozen(map)).toBe(true);
    expect((map as Map<string, number>).get("b")).toBe(2);
  });

  test("keeps a Secret working", () => {
    const config = deepFreeze({ password: new Secret("deep-freeze-secret-1") });

    expect(config.password).toBeInstanceOf(Secret);
    expect(config.password.reveal()).toBe("deep-freeze-secret-1");
  });
});
