import type { Page, Response } from "@playwright/test";

/**
 * Runs an action and waits for the response it causes, so a test or page object never reads the page before the
 * platform has answered. The wait starts before the action, so a fast response is not missed.
 *
 * @example
 * const response = await whenResponse(page, (candidate) => candidate.url().endsWith("/search"), () => input.fill(term));
 *
 * @returns The first response that `matches`.
 */
export async function whenResponse(
  page: Page,
  matches: (response: Response) => boolean,
  action: () => Promise<unknown>,
): Promise<Response> {
  const [response] = await Promise.all([page.waitForResponse(matches), action()]);
  return response;
}

/**
 * {@link whenResponse} for a GraphQL operation: runs the action and waits for the response to the request that
 * carries `operationName`.
 *
 * @example
 * await whenGraphql(page, "AddWishlist", () => modal.saveButton.click());
 */
export function whenGraphql(page: Page, operationName: string, action: () => Promise<unknown>): Promise<Response> {
  return whenResponse(page, isGraphqlOperation(operationName), action);
}

/** Response predicate for a GraphQL operation, batched requests included; prefer {@link whenGraphql}. */
export function isGraphqlOperation(operationName: string): (response: Response) => boolean {
  return (response) => {
    const request = response.request();
    if (request.method() !== "POST" || !request.url().includes("/graphql")) {
      return false;
    }
    const body = parsedBody(request.postData());
    return (Array.isArray(body) ? body : [body]).some(
      (entry: unknown) =>
        typeof entry === "object" && entry !== null && Reflect.get(entry, "operationName") === operationName,
    );
  };
}

function parsedBody(text: string | null): unknown {
  try {
    return text === null ? undefined : JSON.parse(text);
  } catch {
    return undefined;
  }
}
