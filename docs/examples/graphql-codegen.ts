import { graphqlCodegenConfig } from "@virtocommerce/test-automation-framework/graphql";

export default graphqlCodegenConfig({
  schema: "https://platform.example.com/graphql",
  documents: ["graphql/fragments/*.graphql", "graphql/operations/**/*.graphql"],
  output: "graphql/generated/",
  strictScalars: true,
  scalars: { DateTime: "string" },
});
