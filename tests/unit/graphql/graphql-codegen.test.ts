import { expect, test } from "@playwright/test";

import { graphqlCodegenConfig } from "@/graphql";

test.describe("graphqlCodegenConfig", () => {
  test("generates typed string documents with the client preset", () => {
    const config = graphqlCodegenConfig({ schema: "schema.graphql", documents: "ops/*.graphql", output: "generated/" });

    expect(config).toEqual({
      overwrite: true,
      schema: "schema.graphql",
      documents: ["ops/*.graphql"],
      generates: {
        "generated/": {
          preset: "client",
          presetConfig: { fragmentMasking: false },
          config: {
            documentMode: "string",
            enumsAsTypes: true,
            useTypeImports: true,
            importExtension: ".ts",
            defaultScalarType: "unknown",
            strictScalars: false,
            scalars: {},
          },
        },
      },
    });
  });

  test("passes several document globs, the scalars, strict scalars and the import extension", () => {
    const config = graphqlCodegenConfig({
      schema: "schema.graphql",
      documents: ["queries/*.graphql", "mutations/*.graphql"],
      output: "generated/",
      scalars: { DateTime: "string" },
      strictScalars: true,
      importExtension: ".js",
    });

    expect(config.documents).toEqual(["queries/*.graphql", "mutations/*.graphql"]);
    expect(config.generates["generated/"]?.["config"]).toMatchObject({
      scalars: { DateTime: "string" },
      strictScalars: true,
      importExtension: ".js",
    });
  });

  test("copies the documents and the scalars", () => {
    const documents = ["ops/*.graphql"];
    const scalars: Record<string, string> = { DateTime: "string" };

    const config = graphqlCodegenConfig({ schema: "schema.graphql", documents, output: "generated/", scalars });
    documents.push("more/*.graphql");
    scalars["Decimal"] = "number";

    expect(config.documents).toEqual(["ops/*.graphql"]);
    expect(config.generates["generated/"]?.["config"]).toMatchObject({ scalars: { DateTime: "string" } });
  });
});
