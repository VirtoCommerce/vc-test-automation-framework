import { format, inspect } from "node:util";

import { expect, test } from "@playwright/test";

import { MASKED, maskSecrets, revealedFields, revealedJson, SECRET_MIN_LENGTH, Secret } from "@/core";

test.describe("Secret.of", () => {
  const OUTPUTS = [
    { title: "a template literal", print: (secret: Secret) => `${secret}` },
    { title: "String()", print: (secret: Secret) => String(secret) },
    { title: "JSON.stringify", print: (secret: Secret) => JSON.stringify({ secret }) },
    { title: "util.inspect", print: (secret: Secret) => inspect({ secret }) },
    { title: "util.format", print: (secret: Secret) => format("%s %o", secret, secret) },
  ];

  for (const { title, print } of OUTPUTS) {
    test(`hides the value from ${title}`, () => {
      const output = print(Secret.of("Output-Value-1"));

      expect(output).toContain(MASKED);
      expect(output).not.toContain("Output-Value-1");
    });
  }

  test("keeps the value for reveal()", () => {
    expect(Secret.of("Reveal-Value-1").reveal()).toBe("Reveal-Value-1");
  });

  test("exposes no property that holds the value", () => {
    const secret = Secret.of("Property-Value-1");

    expect(Object.keys(secret)).toEqual([]);
    expect({ ...secret }).toEqual({});
  });

  test("returns a frozen instance", () => {
    expect(Object.isFrozen(Secret.of("Frozen-Value-1"))).toBe(true);
  });

  test("accepts a value of the minimum length", () => {
    const value = "q7#z";

    expect(value).toHaveLength(SECRET_MIN_LENGTH);
    expect(Secret.of(value).reveal()).toBe(value);
  });

  for (const value of ["", "x", "x9!"]) {
    test(`rejects a value of ${value.length} characters`, () => {
      expect(() => Secret.of(value)).toThrow(RangeError);
      expect(() => Secret.of(value)).toThrow(`at least ${SECRET_MIN_LENGTH} characters`);
    });
  }

  test("keeps a rejected value out of the error message", () => {
    expect(() => Secret.of("k3$")).toThrow(expect.objectContaining({ message: expect.not.stringContaining("k3$") }));
  });

  test("does not register a rejected value", () => {
    expect(() => Secret.of("w5%")).toThrow(RangeError);

    expect(maskSecrets("pin w5%")).toBe("pin w5%");
  });
});

test.describe("Secret.equals", () => {
  test("returns true for secrets with the same value", () => {
    expect(Secret.of("Equal-Value-1").equals(Secret.of("Equal-Value-1"))).toBe(true);
  });

  test("returns false for secrets with different values", () => {
    expect(Secret.of("Equal-Value-2").equals(Secret.of("Equal-Value-3"))).toBe(false);
  });
});

test.describe("Secret.withPrefix", () => {
  test("holds the prefix followed by the value and masks it in output", () => {
    const header = Secret.of("prefix-token-1").withPrefix("Bearer ");

    expect(header.reveal()).toBe("Bearer prefix-token-1");
    expect(`${header}`).toBe(MASKED);
  });

  test("is masked through the registered value", () => {
    const header = Secret.of("prefix-token-2").withPrefix("Bearer ");

    expect(maskSecrets(`authorization: ${header.reveal()}`)).toBe(`authorization: Bearer ${MASKED}`);
  });
});

test.describe("maskSecrets", () => {
  const ENCODINGS = [
    { title: "as is", value: "Plain Value!1", text: "password=Plain Value!1" },
    { title: "URI-encoded", value: "Uri Value!1", text: "/api/users/Uri%20Value!1/lock" },
    { title: "form-encoded", value: "Form Value!1", text: "grant_type=password&password=Form+Value%211&scope=x" },
    { title: "JSON-escaped", value: 'Json"Value\\1', text: '{"password":"Json\\"Value\\\\1"}' },
  ];

  for (const { title, value, text } of ENCODINGS) {
    test(`masks a value ${title}`, () => {
      Secret.of(value);

      expect(maskSecrets(text)).not.toContain("Value");
      expect(maskSecrets(text)).toContain(MASKED);
    });
  }

  test("masks every occurrence", () => {
    Secret.of("Repeated-Value-1");

    expect(maskSecrets("a Repeated-Value-1 b Repeated-Value-1")).toBe(`a ${MASKED} b ${MASKED}`);
  });

  test("masks the longer of two overlapping values as a whole", () => {
    Secret.of("Overlap-Value");
    Secret.of("Overlap-Value-Longer");

    expect(maskSecrets("token Overlap-Value-Longer")).toBe(`token ${MASKED}`);
  });

  test("masks a value registered after an earlier call", () => {
    Secret.of("Earlier-Value-1");
    maskSecrets("warm up");
    Secret.of("Later-Value-1");

    expect(maskSecrets("Earlier-Value-1 Later-Value-1")).toBe(`${MASKED} ${MASKED}`);
  });

  test("matches regular expression characters literally", () => {
    Secret.of("Regex.Value*(1)");

    expect(maskSecrets("key Regex.Value*(1)")).toBe(`key ${MASKED}`);
    expect(maskSecrets("key RegexXValue*(1)")).toBe("key RegexXValue*(1)");
  });

  const TOKENS = [
    { title: "after a separator", text: "password=Kestrel", masked: `password=${MASKED}` },
    { title: "in parentheses", text: "(Kestrel)", masked: `(${MASKED})` },
    { title: "followed by a letter", text: "Kestrels", masked: "Kestrels" },
    { title: "preceded by a letter", text: "aKestrel", masked: "aKestrel" },
    { title: "followed by a digit", text: "Kestrel1", masked: "Kestrel1" },
    { title: "followed by a non-Latin letter", text: "Kestrelé", masked: "Kestrelé" },
  ];

  for (const { title, text, masked } of TOKENS) {
    test(`masks a value only as a whole token: ${title}`, () => {
      Secret.of("Kestrel");

      expect(maskSecrets(text)).toBe(masked);
    });
  }

  test("returns a text without registered values unchanged", () => {
    Secret.of("Unrelated-Value-1");
    const text = "GET http://localhost/api/catalog/products → 503 Service Unavailable";

    expect(maskSecrets(text)).toBe(text);
  });
});

test.describe("revealedFields", () => {
  test("replaces each Secret with its value and keeps other values", () => {
    const fields = { password: Secret.of("Fields-Secret-1"), user: "admin", take: 10 };

    expect(revealedFields(fields)).toEqual({ password: "Fields-Secret-1", user: "admin", take: 10 });
  });

  test("returns a copy and leaves the fields unchanged", () => {
    const password = Secret.of("Fields-Secret-2");
    const fields = { password };

    expect(revealedFields(fields)).not.toBe(fields);
    expect(fields.password).toBe(password);
  });

  test("returns an empty object for empty fields", () => {
    expect(revealedFields({})).toEqual({});
  });
});

test.describe("revealedJson", () => {
  class Credentials {
    readonly password: Secret;

    constructor(password: Secret) {
      this.password = password;
    }
  }

  test("writes a Secret at the top level as its value", () => {
    expect(revealedJson(Secret.of("Json-Top-Secret-1"))).toBe('"Json-Top-Secret-1"');
  });

  test("writes a Secret nested in arrays, objects and class instances as its value", () => {
    const secret = Secret.of("Json-Nested-Secret-1");

    expect(
      JSON.parse(revealedJson({ list: [secret], nested: { secret }, credentials: new Credentials(secret) })),
    ).toEqual({
      list: ["Json-Nested-Secret-1"],
      nested: { secret: "Json-Nested-Secret-1" },
      credentials: { password: "Json-Nested-Secret-1" },
    });
  });

  test("serializes values without secrets as JSON.stringify does", () => {
    const value = {
      text: "a",
      number: 1,
      flag: true,
      empty: null,
      missing: undefined,
      date: new Date(0),
      list: [1, "b"],
    };

    expect(revealedJson(value)).toBe(JSON.stringify(value));
  });

  const UNSERIALIZABLE = [
    { title: "undefined", value: undefined },
    { title: "a function", value: () => "x" },
    { title: "a symbol", value: Symbol("x") },
  ];

  for (const { title, value } of UNSERIALIZABLE) {
    test(`throws a TypeError for ${title}`, () => {
      expect(() => revealedJson(value)).toThrow(TypeError);
      expect(() => revealedJson(value)).toThrow("The value cannot be serialized to JSON");
    });
  }

  test("leaves the value unchanged", () => {
    const secret = Secret.of("Json-Unchanged-Secret-1");
    const value = { secret };

    revealedJson(value);

    expect(value.secret).toBe(secret);
  });
});
