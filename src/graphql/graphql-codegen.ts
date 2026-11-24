/** The options of {@link graphqlCodegenConfig}. */
export interface GraphqlCodegenOptions {
  /** The GraphQL schema: a schema file, a glob of schema files, or the URL of a GraphQL endpoint. */
  readonly schema: string;
  /** The operation documents, as one glob or several, such as `graphql/operations/*.graphql`. */
  readonly documents: string | readonly string[];
  /** The directory that receives the generated files, such as `graphql/generated/`. */
  readonly output: string;
  /**
   * The TypeScript types of custom scalars by scalar name, such as `{ DateTime: "string" }`. Custom scalars that are
   * not listed are `unknown`, unless `strictScalars` is set.
   */
  readonly scalars?: Readonly<Record<string, string>> | undefined;
  /**
   * Whether the generation fails for a custom scalar that `scalars` does not list, so a new scalar of the schema is
   * noticed. The default is `false`.
   */
  readonly strictScalars?: boolean | undefined;
  /**
   * The extension of the imports between the generated files. The default is `.ts`, which needs
   * `allowImportingTsExtensions` or `rewriteRelativeImportExtensions` in the TypeScript configuration of the test
   * suite.
   */
  readonly importExtension?: ".ts" | ".js" | undefined;
}

/** A configuration for GraphQL Code Generator. */
export interface GraphqlCodegenConfig {
  /** Whether to overwrite the generated files. */
  readonly overwrite: boolean;
  /** The GraphQL schema. */
  readonly schema: string;
  /** The operation documents. */
  readonly documents: readonly string[];
  /** The generated outputs by directory, with the preset and the settings of each. */
  readonly generates: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

/**
 * Returns a GraphQL Code Generator configuration that generates typed documents for `GraphqlClient`.
 *
 * @remarks
 * The configuration uses the client preset in the string document mode, so each operation becomes a typed document,
 * such as `GetCartDocument`, that `GraphqlClient` accepts directly. Enums become string unions, and fragment masking is
 * off.
 *
 * @param options - The schema, the operation documents, the output directory and the custom scalars.
 * @returns The configuration to export from the codegen configuration file of the test suite.
 *
 * @example
 * export default graphqlCodegenConfig({
 *   schema: "graphql/schema.graphql",
 *   documents: "graphql/operations/*.graphql",
 *   output: "graphql/generated/",
 *   scalars: { DateTime: "string", Decimal: "number" },
 * });
 */
export function graphqlCodegenConfig(options: GraphqlCodegenOptions): GraphqlCodegenConfig {
  return {
    overwrite: true,
    schema: options.schema,
    documents: typeof options.documents === "string" ? [options.documents] : [...options.documents],
    generates: {
      [options.output]: {
        preset: "client",
        presetConfig: { fragmentMasking: false },
        config: {
          documentMode: "string",
          enumsAsTypes: true,
          useTypeImports: true,
          importExtension: options.importExtension ?? ".ts",
          defaultScalarType: "unknown",
          strictScalars: options.strictScalars ?? false,
          scalars: { ...options.scalars },
        },
      },
    },
  };
}
