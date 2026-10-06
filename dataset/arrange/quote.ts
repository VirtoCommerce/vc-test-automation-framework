import type { QuoteFragment } from "@api/graphql/generated/graphql";
import type { GraphqlClient } from "@api/graphql/graphql-client";
import type { HttpClient } from "@api/http/http-client";
import type { CleanupStack } from "@core/cleanup-stack";

import { CreateQuoteFromCartDocument } from "@api/graphql/generated/graphql";
import { QuotesClient } from "@api/rest/clients/quotes-client";
import { requireFields } from "@core/required-fields";

export type ArrangedQuote = QuoteFragment & { readonly id: string };

export async function arrangeQuoteFromCart(
  graphqlClient: GraphqlClient,
  platformAdminHttpClient: HttpClient,
  cleanupStack: CleanupStack,
  cartId: string,
): Promise<ArrangedQuote> {
  const { createQuoteFromCart } = await graphqlClient.execute(CreateQuoteFromCartDocument, {
    command: { cartId, comment: "Quote requested by an automated test" },
  });
  return registerQuoteRemoval(platformAdminHttpClient, cleanupStack, createQuoteFromCart);
}

export function registerQuoteRemoval(
  platformAdminHttpClient: HttpClient,
  cleanupStack: CleanupStack,
  quote: QuoteFragment | null | undefined,
): ArrangedQuote {
  const created = requireFields(quote, ["id"], "Created quote");
  cleanupStack.push(`delete quote ${created.number}`, () =>
    new QuotesClient(platformAdminHttpClient).delete([created.id]),
  );
  return created;
}
