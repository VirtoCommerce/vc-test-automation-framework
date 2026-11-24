# Environment

A test suite reads its settings from environment variables. The framework defines the variables that every Virto
Commerce-based solution needs, and each test suite extends them with its own.

## The framework variables

`envSchema`, exported from `@virtocommerce/test-automation-framework/core`, describes these variables:

| Variable                | Required | Default | Meaning                                                            |
| ----------------------- | -------- | ------- | ------------------------------------------------------------------ |
| `BACKEND_BASE_URL`      | Yes      |         | The origin of the platform, such as `https://platform.example.com` |
| `ADMIN_USERNAME`        | Yes      |         | The user name of the platform administrator account                |
| `ADMIN_PASSWORD`        | Yes      |         | The password of the administrator account, parsed as a `Secret`    |
| `VERIFY_SSL`            | No       | `true`  | Whether to verify the TLS certificate of the platform              |
| `REQUEST_TIMEOUT_MS`    | No       | `30000` | The time to wait for a response, in milliseconds                   |
| `RUN_DESTRUCTIVE_TESTS` | No       | `false` | Whether to run tests that delete or change shared data             |
| `SKIP_PLATFORM_DEFECTS` | No       | `false` | Whether to leave out tests tagged `@platform-defect`               |
| `API_WORKERS`           | No       | `4`     | The number of workers that run API tests, such as REST and GraphQL |
| `E2E_WORKERS`           | No       | `3`     | The number of workers that run end-to-end browser tests            |

`BACKEND_BASE_URL` must be an origin, without a path, query or fragment, and without a user name or password.
`API_WORKERS` and `E2E_WORKERS` limit the projects that the [Playwright config](config.md) helpers return.

## Extending the variables

A test suite extends `envSchema` with its own variables and can redefine a variable to change its default:

<!-- example: ../examples/environment.ts -->
```ts
import { absoluteUrl, envSchema, parseEnv, positiveInt } from "@virtocommerce/test-automation-framework/core";

export const suiteEnvSchema = envSchema.extend({
  API_WORKERS: positiveInt.default(8),
  MAILBOX_URL: absoluteUrl,
});

export const env = parseEnv(suiteEnvSchema);
```

Use the schemas from `@virtocommerce/test-automation-framework/core` for the values: `nonBlankString`, `absoluteUrl`,
`originUrl`, `positiveInt`, `booleanString` and `secretString`.

Stores are not environment variables, because a solution can have several stores. A test suite describes its stores
in its own configuration.

## Parsing

`parseEnv` parses the variables with a schema and returns them typed:

- An empty variable counts as unset, so its default applies. A line such as `API_WORKERS=` in a `.env` file does not fail.
- When variables are invalid, it throws one error that lists each of them. The message does not contain the values,
  so it is safe to print even for passwords.
- Variables that the schema does not name are left out.
