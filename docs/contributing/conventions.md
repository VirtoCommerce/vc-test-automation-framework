# Conventions

## Terms

Use the terms from the [documentation index](../README.md#terms): framework, solution and test suite. Use "frontend"
for the shop application and "platform" for the Virto Commerce backend. Do not call a test suite an "organization";
the platform has its own organizations.

## Code

- Declare named functions with `function`. Use arrow functions only for inline callbacks.
- Do not add code comments. Documentation comments on exported members are required.
- Name a file after the concept it holds, such as `secret.ts` or `http-client.ts`. Name a file that holds one tool
  after the tool, such as `parse-env.ts`.
- Name schema values in camelCase, such as `envSchema`.
- Keep the framework free of anything specific to one solution or one store.

## Documentation comments

Every exported member has a documentation comment in a formal style that both people and AI agents can follow:

- The summary is a full sentence in the present tense that starts with a verb, such as "Returns…" or "Determines
  whether…". A type or a constant starts with a noun phrase, such as "Represents…" or "The options of…".
- Functions, methods and constructors have `@param`, `@returns` and `@throws {Type}`, each a full sentence.
- Details go in `@remarks`, and examples in `@example`.
- Do not name the libraries that the framework uses internally. Write "schema", not the name of the schema library.
- Do not use shorthand in prose. Write "a success status (2xx)" rather than "2xx", and use words instead of arrows.

## Errors and retries

- Do not retry a failed request, and do not work around a platform failure. A failing test fails, and its cause is
  found and reported. A platform defect is reported in the issue tracker, and the test keeps failing until it is fixed.
- Keep secrets out of every message: create them with `Secret.of`, and mask messages with `maskSecrets`.

## Tests

- Every public behaviour has a unit test. Tests of network code run against a local `node:http` server.
- After fixing a defect, check that its test fails without the fix.
- Do not add test retries.
