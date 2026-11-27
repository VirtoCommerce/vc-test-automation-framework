import { graphqlCodegenConfig } from "@virtocommerce/test-automation-framework/graphql";

import { env } from "./env.ts";

if (!env.VERIFY_SSL) {
  process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";
}

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
