import type { GraphqlClient } from "@api/graphql/graphql-client";
import type { CustomerAccount, OrganizationRole } from "@dataset/arrange/customer-account";
import type { FrontendContext } from "@dataset/frontend-context";

import { mergeTests } from "@playwright/test";

import { arrangeCustomerAccount, customerAccountContext, signInGraphqlClient } from "@dataset/arrange/customer-account";
import { getStoreContext } from "@dataset/frontend-context";

import { test as cleanupTest } from "./cleanup.fixture";
import { test as datasetTest } from "./dataset.fixture";

export interface SignedInCustomerAccount extends CustomerAccount {
  readonly graphqlClient: GraphqlClient;
  readonly context: FrontendContext;
}

export interface CustomerAccountOptions {
  readonly customerAccountRole: OrganizationRole;
  readonly browserCustomerAccount: SignedInCustomerAccount | undefined;
}

export interface CustomerAccountFixtures {
  readonly newCustomerAccount: () => Promise<SignedInCustomerAccount>;
  readonly customerAccount: SignedInCustomerAccount;
}

export const test = mergeTests(cleanupTest, datasetTest).extend<CustomerAccountOptions & CustomerAccountFixtures>({
  customerAccountRole: ["org-employee", { option: true }],
  browserCustomerAccount: [undefined, { option: true }],

  newCustomerAccount: async (
    { platformAdminHttpClient, anonymousHttpClient, tokenManager, cleanupStack, dataset, env, customerAccountRole },
    use,
  ) => {
    await use(async () => {
      const account = await arrangeCustomerAccount(platformAdminHttpClient, cleanupStack, {
        storeId: env.storeId,
        role: customerAccountRole,
      });
      const { username } = account.credentials;
      cleanupStack.push(`sign out ${username}`, () => tokenManager.signOut(username, env.storeId));
      const graphqlClient = await signInGraphqlClient(
        tokenManager,
        anonymousHttpClient,
        account.credentials,
        env.storeId,
      );
      const context = customerAccountContext(getStoreContext(dataset, env.storeId), account);
      return { ...account, graphqlClient, context };
    });
  },

  customerAccount: async ({ browserCustomerAccount, newCustomerAccount }, use) => {
    await use(browserCustomerAccount ?? (await newCustomerAccount()));
  },
});
