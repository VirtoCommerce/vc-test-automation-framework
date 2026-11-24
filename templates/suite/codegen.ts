import { graphqlCodegenConfig } from "@virtocommerce/test-automation-framework/graphql";

import { env } from "./env.ts";

const config = graphqlCodegenConfig({
  schema: new URL("/graphql", env.BACKEND_BASE_URL).href,
  documents: ["graphql/fragments/*.graphql", "graphql/operations/**/*.graphql"],
  output: "graphql/generated/",
  scalars: {
    Date: "string",
    DateTime: "string",
    Decimal: "number",
    Long: "number",
    OptionalDecimal: "number | null",
    OptionalNullableDecimal: "number | null",
    OptionalString: "string | null",
  },
});

export default {
  ...config,
  ignoreNoDocuments: true,
  generates: {
    ...config.generates,
    "graphql/generated/schema.graphql": { plugins: ["schema-ast"] },
  },
};
