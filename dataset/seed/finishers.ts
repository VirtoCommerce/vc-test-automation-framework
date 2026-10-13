import type { TokenClient } from "@api/auth/token-client";
import type { RestApi } from "@api/rest/rest-api";
import type { Logger } from "@core/logger";
import type { Dataset } from "../dataset";
import type { SeedRun } from "./seeder";

import { requireFields } from "@core/required-fields";

import { credentialsOf } from "../users";
import { applyPageStatuses } from "./page-statuses";
import { applyUserPasswords } from "./user-passwords";

/**
 * Builds the work that follows some collections: after `users`, existing users get the dataset password
 * ({@link applyUserPasswords}); after `pagesContent`, pages get their dataset status ({@link applyPageStatuses}).
 *
 * @param rest - Signed in as the administrator who seeds.
 * @param tokens - The platform's token endpoint, to check the users' passwords.
 */
export function seedFinishers(
  rest: RestApi,
  tokens: TokenClient,
  dataset: Dataset,
  logger: Logger,
): NonNullable<SeedRun["finishers"]> {
  return {
    users: () =>
      applyUserPasswords(
        {
          canSignIn: async (credentials) => (await tokens.requestPasswordGrant(credentials)).ok,
          resetPassword: (userName, password) => rest.users.resetPassword(userName, password),
        },
        dataset.users
          .all()
          .map((user) => credentialsOf(dataset, requireFields(user, ["userName"], "Dataset user").userName)),
        logger,
      ),
    pagesContent: () => applyPageStatuses(rest.pageBuilder.pages, dataset.pages.all(), logger),
  };
}
