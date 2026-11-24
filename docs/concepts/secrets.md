# Secrets

Test suites handle passwords, tokens and keys. The framework keeps their values out of test output, traces of errors
and logs, without each test having to remember it.

## The `Secret` type

A `Secret` holds a value that never appears in output. String conversion, JSON serialization and console output all
produce `[SECRET]`. Only `reveal()` returns the value, and only code that sends or stores the value should call it.

<!-- example: ../examples/secrets.ts -->
```ts
import { expect, test } from "@playwright/test";
import { maskSecrets, Secret } from "@virtocommerce/test-automation-framework/core";

test("a secret never appears in output", () => {
  const password = Secret.of("Password1!");

  expect(`${password}`).toBe("[SECRET]");
  expect(JSON.stringify({ password })).toBe('{"password":"[SECRET]"}');
  expect(maskSecrets("password=Password1%21")).toBe("password=[SECRET]");
  expect(password.reveal()).toBe("Password1!");
});
```

Secrets are created with `Secret.of`, or by parsing a variable with the `secretString` schema. A secret must have at
least four characters, because a shorter value cannot be masked without also masking ordinary text.

## Masking

Each value created by `Secret.of` is registered for the lifetime of the process. `maskSecrets` replaces every
registered value in a text with `[SECRET]`:

- The value is also masked in its URI-encoded, form-encoded and JSON-escaped forms, so it is masked in URLs, form
  bodies and JSON.
- A value is replaced only where it stands as a whole token. A password `admin` is masked in `password=admin`, but not
  in `administrator`.
- `withPrefix` builds a secret from a prefix and a secret, such as `Bearer ` and an access token, without registering
  another value: the registered value inside it is already masked.

The framework masks secrets in every message it produces: HTTP errors, their bodies, response URLs and failed
requests. Use `maskSecrets` for your own messages and logs that can contain requests or responses.

## Revealing

The HTTP client accepts secrets in the query, headers and body of a request, and reveals them only when it sends the
request. Test code passes `Secret` values and never calls `reveal()` itself.

For code that builds a request in another way, `revealedFields` and `revealedJson` reveal the secrets in fields or a
JSON body. Call them only where the result is sent, and keep the result out of messages, logs and assertions.
