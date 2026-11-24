import { graphqlCodegenConfig } from "@virtocommerce/test-automation-framework/graphql";

import { env } from "./env.ts";

const config = graphqlCodegenConfig({
  schema: new URL("/graphql", env.BACKEND_BASE_URL).href,
  documents: ["virtocommerce/graphql/fragments/*.graphql", "virtocommerce/graphql/operations/**/*.graphql"],
  output: "virtocommerce/graphql/generated/",
  strictScalars: true,
  scalars: {
    Date: "string",
    DateTime: "string",
    Decimal: "number",
    Long: "number",
    Seconds: "number",
    StoreAssetUrl: "string",
    OptionalDecimal: "number | null",
    OptionalNullableDecimal: "number | null",
    OptionalString: "string | null",
    AnyValue: "unknown",
    DynamicPropertyValue: "unknown",
    PropertyValue: "unknown",
    ModuleSettingValue: "unknown",
  },
});

export default {
  ...config,
  generates: {
    ...config.generates,
    "virtocommerce/graphql/generated/schema.graphql": { plugins: ["schema-ast"] },
  },
};
