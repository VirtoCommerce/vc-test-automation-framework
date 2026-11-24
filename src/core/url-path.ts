/**
 * A URL path that starts with `/`, such as `/api/catalog/catalogs`, resolved against the base URL of a client.
 *
 * @remarks
 * The type only checks the leading `/`. A client still refuses a path that resolves to another origin.
 */
export type UrlPath = `/${string}`;
