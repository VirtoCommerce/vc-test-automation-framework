# Test suite

Tests of a Virto Commerce solution: the platform (REST API and xAPI GraphQL) and the frontend. TypeScript on
Playwright Test with `@virtocommerce/test-automation-framework`, Allure reports, Biome for lint and format.

## Commands

```shell
npm run typecheck                      # TypeScript
npm run check                          # Biome lint + format + import order, with fixes
npm run codegen                        # GraphQL and REST types from the running platform
npm test                               # every project; append -- --project=restapi (graphql, e2e-frontend)
npm test -- tests/restapi/security/sign-in.spec.ts   # one file
npm run report && npm run report:open  # Allure report of the last run
```

Settings come from `.env` (see `.env.example`), validated by `env.ts` on top of the framework's schema. Never read,
edit or print `.env`.

## Layout

| Directory                    | Alias         | Holds                                                                |
| ---------------------------- | ------------- | -------------------------------------------------------------------- |
| `tests/restapi/<module>/`    |               | REST specs (project `restapi`)                                       |
| `tests/graphql/<area>/`      |               | xAPI specs (project `graphql`)                                       |
| `tests/e2e/frontend/<area>/` |               | frontend specs (project `e2e-frontend`)                              |
| `fixtures/`                  | `@fixtures`   | `test`, `expect`                                                     |
| `arrange/`                   | `@arrange`    | the `arrange` factory, one file per domain                           |
| `builders/`                  | `@builders/*` | `newX()` payload builders with unique values                         |
| `support/`                   | `@support/*`  | `requireFields`, `uniqueId`, the store, the shopper, `ADMINISTRATOR` |
| `pages/`                     | `@pages/*`    | page objects, one class per file                                     |
| `graphql/operations/<area>/` | `@graphql/*`  | `.graphql` operations, `fragments/`, `generated/` (never edited)     |
| `rest/generated/`            | `@rest/*`     | generated REST types `platform.ts` (never edited)                    |

`tests/graphql/`, `tests/e2e/frontend/`, `pages/` and `graphql/operations/` are created with the first spec, page
object or operation of their kind; `npm run codegen` writes the `generated/` directories.

Specs and fixtures use the aliases; files inside `arrange/`, `builders/`, `support/` and `pages/` import each other by
relative paths. There are no REST clients: specs call the platform with `api.get/post/put/delete` and type the body
with `@rest/generated/platform.ts`. GraphQL specs run typed documents from `@graphql/generated/graphql.ts`.

## Fixtures

- Options, set only with `test.use`: `user` (credentials that `api` and `graphql` act as; anonymous by default) and
  `modules`.
- Test fixtures: `api`, `graphql`, `http` (anonymous), `signIn`, `arrange`, `shopper` (an anonymous visitor with
  `api`, `graphql`, `storeContext`, `userId`).
- Worker fixtures: `env`, `store` (the store of `STORE_ID`), `tokens`, `workerAdmin`.
- `arrange` creates data as the administrator and removes it after the test, last first, each removal a `cleanup:`
  step. A new kind of data gets a new method in its domain file under `arrange/`.

## Writing tests

The framework rules live in the `framework-rules` skill, `.claude/skills/framework-rules/SKILL.md`. Read it before
writing or reviewing a test. Describe identities: `(anonymous)`, `(administrator)`, `(customer of their own)`.

## Code style

- TypeScript strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`; no `any`, no `!`.
- Named and exported functions are `function` declarations; arrows only for inline callbacks.
- No code comments; short documentation comments on exported members.
- Match the surrounding file: naming, step wording, import order (`npm run check` sorts imports).
