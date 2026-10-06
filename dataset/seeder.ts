import type { HttpClient } from "@api/http/http-client";
import type { ApplicationUserData } from "@api/rest/types/security";
import type { Logger } from "@core/logger";
import type { Dataset, DatasetItem } from "./dataset";
import type { ManifestItem, ManifestItemName } from "./manifest";
import type { SeedRequest } from "./seed-requests";

import { ModulesClient } from "@api/rest/clients/modules-client";
import { UsersClient } from "@api/rest/clients/users-client";
import { requireFields } from "@core/required-fields";

import { expectSucceeded } from "./arrange/security";
import { seedRequests } from "./seed-requests";
import { resolveSeedScope } from "./seed-scope";

export interface SeedOptions {
  readonly only?: readonly ManifestItemName[] | undefined;
}

interface EntityResult {
  readonly requests: number;
  readonly failures: readonly unknown[];
}

type EntitySeeder = (
  httpClient: HttpClient,
  entity: ManifestItem,
  items: readonly DatasetItem[],
) => Promise<EntityResult>;

const CUSTOM_SEEDERS: Partial<Record<ManifestItemName, EntitySeeder>> = { users: seedUsers };

export async function seedDataset(
  httpClient: HttpClient,
  dataset: Dataset,
  logger: Logger,
  options: SeedOptions = {},
): Promise<void> {
  const installedModuleIds = await new ModulesClient(httpClient).getInstalledIds();
  const { entities, skipped } = resolveSeedScope(installedModuleIds, options.only);
  const startedAt = Date.now();
  let requestCount = 0;
  let warningCount = 0;

  for (const entity of skipped) {
    const message = `${entity.name}: module ${entity.moduleId} is not installed, skipped`;
    if (options.only === undefined) {
      logger.info(message);
    } else {
      logger.warn(message);
      warningCount++;
    }
  }
  logger.info(`seeding ${entities.length} entities: ${entities.map((entity) => entity.name).join(", ")}`);

  for (const entity of entities) {
    const items = dataset[entity.name] as readonly DatasetItem[];
    if (items.length === 0) {
      logger.warn(`${entity.name}: no items in ${entity.dir}, skipped`);
      warningCount++;
      continue;
    }
    const entityStarted = Date.now();
    const seed = CUSTOM_SEEDERS[entity.name] ?? seedEntity;
    try {
      const { requests, failures } = await seed(httpClient, entity, items);
      requestCount += requests;
      for (const failure of failures) {
        logger.warn(`${entity.name} (optional): ${firstLine(failure)}`);
      }
      warningCount += failures.length;
      logger.success(`${entity.name}: ${items.length} items, ${requests} requests in ${seconds(entityStarted)}`);
    } catch (error) {
      logger.error(`${entity.name}: ${firstLine(error)}`);
      throw error;
    }
  }

  const summary = `${entities.length} entities, ${requestCount} requests in ${seconds(startedAt)}`;
  if (warningCount > 0) {
    logger.warn(`seeded with ${warningCount} warning(s): ${summary}`);
  } else {
    logger.success(`seeded ${summary}`);
  }
}

async function seedEntity(
  httpClient: HttpClient,
  entity: ManifestItem,
  items: readonly DatasetItem[],
): Promise<EntityResult> {
  const requests = seedRequests(entity, items);
  const failures: unknown[] = [];
  for (const request of requests) {
    try {
      (await httpClient.send(entity.method, request.path, { json: request.body })).expectOk();
    } catch (error) {
      const failure = describedFailure(request, error);
      if (!entity.optional) {
        throw failure;
      }
      failures.push(failure);
    }
  }
  return { requests: requests.length, failures };
}

async function seedUsers(
  httpClient: HttpClient,
  _entity: ManifestItem,
  items: readonly DatasetItem[],
): Promise<EntityResult> {
  const usersClient = new UsersClient(httpClient);
  for (const item of items) {
    const user = requireFields(item as ApplicationUserData, ["userName", "password"], "Dataset user");
    const existing = await usersClient.find(user.userName);
    const result =
      existing === undefined
        ? await usersClient.create(user)
        : await usersClient.resetPassword(user.userName, user.password);
    expectSucceeded(result, `${existing === undefined ? "Create" : "Reset the password of"} user ${user.userName}`);
  }
  return { requests: items.length * 2, failures: [] };
}

function describedFailure(request: SeedRequest, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${request.label}: ${message}`, { cause: error });
}

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n")[0] ?? message;
}

function seconds(since: number): string {
  return `${((Date.now() - since) / 1000).toFixed(1)}s`;
}
