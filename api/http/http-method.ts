/** HTTP methods the REST API uses, for run-time checks such as `enum(HTTP_METHODS)` in a zod schema. */
export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/** One of {@link HTTP_METHODS}, upper case as sent on the wire. */
export type HttpMethod = (typeof HTTP_METHODS)[number];
