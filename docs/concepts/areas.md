# Areas

The framework is divided into areas. Each area has its own entry point, and the package has no root entry point, so a
test loads only the areas it uses.

| Entry point                                         | Contains                                                                                                    |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `@virtocommerce/test-automation-framework/core`     | Secrets and masking, string schemas, the environment variables and their parsing, Playwright config helpers |
| `@virtocommerce/test-automation-framework/graphql`  | The GraphQL client, its results and errors, and the configuration for generating typed documents            |
| `@virtocommerce/test-automation-framework/http`     | The HTTP client, its responses and its errors                                                               |
| `@virtocommerce/test-automation-framework/auth`     | Platform sign-in: credentials, access tokens, the token client and manager, and browser sessions            |
| `@virtocommerce/test-automation-framework/modules`  | The modules installed on the platform and the module requirements of tests and dataset collections          |
| `@virtocommerce/test-automation-framework/dataset`  | Loading a dataset from JSON files and seeding it into the platform, driven by a manifest                    |
| `@virtocommerce/test-automation-framework/fixtures` | The default Playwright fixtures: clients, signed-in users, module requirements and browser sessions         |

Only what an entry point exports is public API. Modules that an entry point does not export can change in any release.

## Dependencies between areas

An area uses only the areas below it:

```text
fixtures  → modules, graphql, auth, http, core
dataset   → modules, http, core
auth      → http, core
graphql   → http, core
modules   → http, core
http      → core
core      (no other area)
```

`http` and `graphql` hold nothing specific to Virto Commerce. `core` holds the setup of the framework itself: secrets,
the environment variables that every Virto Commerce-based solution needs, and the parts of the Playwright config.
`auth`, `modules` and `dataset` hold what is the same on every Virto Commerce platform: the token endpoints, the list
of installed modules, and the way data is seeded. The data itself belongs to the test suite.

Nothing in the framework is specific to one solution or one store. Stores, frontends and their settings belong to the
test suite.
