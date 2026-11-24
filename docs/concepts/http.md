# HTTP

`HttpClient` sends requests through a Playwright request context, so the requests appear in test traces. It returns
an `HttpResponse` whose body has already been read.

## The client

A client sends requests to one origin, given when it is created. It is immutable: `withHeaders` and
`withAuthentication` return a new client and leave the original unchanged.

- **One origin.** A path that resolves to another origin is refused before anything is sent, and redirects are not
  followed. Headers, including sign-in headers, never reach another host.
- **No exceptions for a status.** The client returns every response, whatever its status. The response methods check
  the status, as described below.
- **No retries.** A request is sent once. When no response arrives, the client throws an error with secrets masked.
  The only resend is after a 401 status on a client with authentication, once the sign-in has been renewed.
- **Secrets revealed only when sent.** The query, headers and body accept `Secret` values.

### Headers

Headers are merged in this order, and a later header replaces an earlier one of the same name, whatever its case:

1. Headers from `withHeaders`, in the order the calls were made.
2. Sign-in headers from `withAuthentication`.
3. The content type of a JSON body.
4. Headers given with the request.

A header provider passed to `withHeaders` is called for each request, so values that change are picked up.

### Bodies

A request has at most one body:

| Option      | Sent as                                                                                 |
| ----------- | --------------------------------------------------------------------------------------- |
| `json`      | JSON with the `application/json` content type, with each `Secret` at any depth revealed |
| `form`      | URL-encoded form fields                                                                 |
| `multipart` | Multipart form data with text fields and files                                          |

For `form` and `multipart` bodies, a content type set with `withHeaders` is ignored, so the body is encoded correctly.

## The response

| Member                  | Returns                                                          | Throws an `HttpError` when                                  |
| ----------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| `ok`                    | Whether the status is a success status (2xx)                     | Never                                                       |
| `expectOk()`            | The response                                                     | The status is not a success status                          |
| `json<T>()`             | The body parsed as JSON, not checked at run time                 | The status is not a success status, or the body is not JSON |
| `parse(schema)`         | The body validated by a schema                                   | As for `json`, or the body does not match the schema        |
| `optionalJson<T>()`     | As for `json`, or `undefined` for an empty or `null` body        | As for `json`                                               |
| `parseOptional(schema)` | As for `parse`, or `undefined` for an empty or `null` body       | As for `parse`                                              |
| `errorJson<T>()`        | The body of an error response parsed as JSON, for negative tests | The status is a success status, or the body is not JSON     |
| `toError(reason)`       | An `HttpError` that describes the response, for other checks     | Never; the caller throws it                                 |

Because `json` and `parse` require a success status and `errorJson` requires an error status, a missed status check
cannot hide a failure.

A 404 status is an error for `optionalJson` and `parseOptional` too, because a server also returns it for an unknown
route. For an endpoint that answers a missing record with 404, pass `{ allow404: true }`, and the method returns
`undefined` for a 404 status as well.

<!-- example: ../examples/http.ts -->
```ts
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { expect } from "@playwright/test";
import { object, string } from "zod";

const storeSchema = object({ id: string(), name: string() });

export async function readStore(client: HttpClient, id: string) {
  const response = await client.get(`/api/stores/${encodeURIComponent(id)}`);
  return response.parse(storeSchema);
}

export async function rejectionOf(client: HttpClient, path: string, body: unknown) {
  const response = await client.post(path, { json: body });

  expect(response.ok).toBe(false);
  return response.errorJson();
}
```

## Errors

An `HttpError` names the request and the status, and quotes the body. The URL in the message has no query or
fragment, the body is shortened after 1000 characters, and secrets are masked in the message and in `error.body`.
`HttpError.hasStatus(error, 404, 409)` tells whether an unknown value is an `HttpError` with one of the statuses.
