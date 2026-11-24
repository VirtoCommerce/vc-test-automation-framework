# Playwright config

The framework returns the parts of a Playwright config that every test suite of a Virto Commerce platform sets the
same way. The test suite keeps its own config file and its layout: its projects, test directories and setup.

<!-- example: ../examples/config.ts -->
```ts
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";
import {
  apiProject,
  DESTRUCTIVE_TAG,
  defaultReporters,
  defaultRunOptions,
  defaultUse,
  e2eProject,
  envSchema,
  parseEnv,
} from "@virtocommerce/test-automation-framework/core";

const env = parseEnv(envSchema);

export default defineConfig({
  ...defaultRunOptions(env),
  reporter: defaultReporters({
    outputDir: fileURLToPath(new URL("reports", import.meta.url)),
    environment: { backend: env.BACKEND_BASE_URL },
  }),
  use: defaultUse(env),
  projects: [
    { name: "seed", testDir: "setup", testMatch: "seed.setup.ts" },
    apiProject(env, { name: "rest", testDir: "tests/rest", dependencies: ["seed"] }),
    e2eProject(env, {
      name: "frontend",
      testDir: "tests/e2e",
      dependencies: ["seed"],
      use: { ...devices["Desktop Chrome"] },
    }),
  ],
});

export const destructiveTestDetails = { tag: DESTRUCTIVE_TAG };
```

## Run options

`defaultRunOptions` returns the options of the whole run:

| Option       | Value                                                       | Why                                             |
| ------------ | ----------------------------------------------------------- | ----------------------------------------------- |
| `retries`    | `0`                                                         | A flaky test fails and is fixed, not hidden     |
| `forbidOnly` | `true` on CI                                                | A forgotten `test.only` does not shrink CI runs |
| `workers`    | The larger of `API_WORKERS` and `E2E_WORKERS`               | API and browser tests share one worker budget   |
| `grepInvert` | Tests tagged `@destructive`, unless `RUN_DESTRUCTIVE_TESTS` | Shared data is changed only where it is allowed |

A run counts as CI when the `CI` variable is set to a value other than empty, `false` or `0`; `isCi` from the `core`
area tells the same. Tag a test that deletes or changes shared data with `DESTRUCTIVE_TAG`, such as
`test("deletes a store", { tag: DESTRUCTIVE_TAG }, async () => {})`. A project that sets its own `grepInvert` replaces
the filter.

## Projects

`apiProject` limits a project of REST or GraphQL tests to `API_WORKERS` workers, and `e2eProject` limits a project of
browser tests to `E2E_WORKERS` workers. A project that sets its own `workers` keeps it. When API and browser projects
run at the same time, they share the workers of the run, so the run never uses more workers than the larger budget.

## `use` options

`defaultUse` returns the certificate check from `VERIFY_SSL`, keeps the trace, a screenshot and a video of failed
tests, and sets the test id attribute to `data-test-id`, the attribute of the Virto Commerce frontend. A test suite
with its own frontend passes its attribute.

## Reporting

`defaultReporters` writes a line for each test to the console, and Allure results to `allure-results` in `outputDir`.
`environment` is shown on the overview of the report; registered secrets in its values are masked.

The Allure reporter needs `allure-playwright`, an optional peer dependency of the framework. Install it in the test
suite, together with `allure`, which generates the report from the results. A test suite that reports in another way
sets its own `reporter`, or adds its reporters to the default ones.

The framework writes nothing to the report itself. What it does reaches the report through Playwright:

| Framework output                                      | In the report                   |
| ----------------------------------------------------- | ------------------------------- |
| Steps and fixture titles, such as reading the modules | Steps                           |
| Attachments, such as the seed log                     | Attachments                     |
| A test skipped for its required modules               | A skipped test, with the reason |
| Errors, with secrets masked                           | The failure message             |

The report groups tests by project, file and `describe` block, so a test directory organized by area gives a
structured report without labels. For other metadata, use Playwright tags and annotations, which every reporter
understands, such as `test("…", { tag: "@smoke" })`.
