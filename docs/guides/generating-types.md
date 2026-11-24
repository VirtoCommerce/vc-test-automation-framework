# Generating types

A test suite generates TypeScript types from the platform's GraphQL schema and OpenAPI documents, so its operations and
requests are typed. The framework never uses generated types; they belong to the test suite.

## GraphQL

GraphQL Code Generator turns the test suite's operations into typed documents that `GraphqlClient` accepts. Install it
in the test suite:

```shell
npm install --save-dev @graphql-codegen/cli @graphql-codegen/client-preset graphql
```

Keep the operations in the test suite, for example one `.graphql` file for each operation in
`graphql/operations/<area>/` and shared fragments in `graphql/fragments/`. Create a `codegen.ts` file that exports the configuration from
`graphqlCodegenConfig`, which holds every setting the client depends on:

<!-- example: ../examples/graphql-codegen.ts -->
```ts
import { graphqlCodegenConfig } from "@virtocommerce/test-automation-framework/graphql";

export default graphqlCodegenConfig({
  schema: "https://platform.example.com/graphql",
  documents: ["graphql/fragments/*.graphql", "graphql/operations/**/*.graphql"],
  output: "graphql/generated/",
  strictScalars: true,
  scalars: { DateTime: "string" },
});
```

Add a script to `package.json` and run it after each change to the schema or the operations:

```json
{
  "scripts": {
    "codegen:graphql": "graphql-codegen --config codegen.ts"
  }
}
```

Each operation becomes a typed document, such as `GetCartDocument` for an operation named `GetCart`. Pass it to
`GraphqlClient.execute`, and the variables and the data are typed. Give the schema, the documents and the output as paths relative to the directory the generation runs from. On Windows,
an absolute path such as `C:/…` is read as a git reference, and the generation fails.

List the custom scalars of the schema in `scalars`;
the others are `unknown`. Set `strictScalars` to make the generation fail for a custom scalar that is not listed, so a
new scalar of the schema is noticed.

The generated files import each other with the `.ts` extension, so the TypeScript configuration of the test suite needs
`allowImportingTsExtensions`, as in [Getting started](../getting-started.md#configure-typescript).

## REST

swagger-typescript-api generates types from OpenAPI documents. Install it in the test suite:

```shell
npm install --save-dev swagger-typescript-api
```

Generate one file for each module's OpenAPI document, with a script for each, such as:

```json
{
  "scripts": {
    "codegen:rest": "swagger-typescript-api generate --path rest/specs/catalog.json --output rest/generated --name catalog.ts --no-client"
  }
}
```

The `--no-client` option generates types only. Do not use the generated clients: they send requests without
`HttpClient`, so the requests do not appear in test traces, secrets are not masked and the sign-in is not applied.
Use the types with `HttpClient`, for example `response.json<Store>()`, or validate the body with a schema.

The tool brings its own TypeScript version, so it works in a test suite with any TypeScript version.
