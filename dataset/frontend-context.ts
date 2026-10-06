import type { Dataset } from "./dataset";

import { requireFields } from "@core/required-fields";

import { getUser } from "./dataset";

const STORE_CONTEXT_FIELDS = ["id", "catalog", "defaultCurrency", "defaultLanguage"] as const;

export interface StoreContext {
  readonly storeId: string;
  readonly catalogId: string;
  readonly currencyCode: string;
  readonly cultureName: string;
}

export interface FrontendContext extends StoreContext {
  readonly userId: string;
  readonly userName: string | undefined;
  readonly contactId: string | undefined;
  readonly organizationId: string | undefined;
}

export function getStoreContext(dataset: Dataset, storeId: string): StoreContext {
  const store = requireFields(
    dataset.stores.find((item) => item.id === storeId),
    STORE_CONTEXT_FIELDS,
    `Dataset store "${storeId}"`,
  );
  return {
    storeId,
    catalogId: store.catalog,
    currencyCode: store.defaultCurrency,
    cultureName: store.defaultLanguage,
  };
}

export function getFrontendContext(
  dataset: Dataset,
  storeId: string,
  username: string | undefined,
  anonymousUserId: string,
): FrontendContext {
  const storeContext = getStoreContext(dataset, storeId);
  if (username === undefined) {
    return {
      ...storeContext,
      userId: anonymousUserId,
      userName: undefined,
      contactId: undefined,
      organizationId: undefined,
    };
  }
  const user = getUser(dataset, username);
  const contactId = user.memberId ?? undefined;
  const contact = dataset.contacts.find((item) => item.id === contactId);
  return {
    ...storeContext,
    userId: user.id,
    userName: username,
    contactId,
    organizationId: contact?.defaultOrganizationId ?? undefined,
  };
}

export function describeShopper(context: FrontendContext): string {
  return context.userName ?? `anonymous shopper ${context.userId}`;
}
