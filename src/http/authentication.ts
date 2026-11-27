import type { HeaderProvider, RequestHeaders } from "./request-options.ts";

/** Describes how an {@link HttpClient} signs in to requests and renews the sign-in after a 401 status. */
export interface Authentication {
  /** Returns the sign-in headers. It is called for each request, so a renewed sign-in is picked up. */
  readonly headers: HeaderProvider;

  /**
   * Renews the sign-in after a request receives a 401 status.
   *
   * @remarks
   * Several requests can call this method at the same time. Renew the sign-in only when the rejected headers still
   * hold the current sign-in. After this method completes, the request is sent once more with fresh headers.
   *
   * @param rejected - The headers of the rejected request.
   */
  readonly renew: (rejected: RequestHeaders) => Promise<void>;
}
