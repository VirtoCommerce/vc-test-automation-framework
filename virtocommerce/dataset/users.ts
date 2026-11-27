import type { Credentials } from "@virtocommerce/test-automation-framework/auth";

import { Secret } from "@virtocommerce/test-automation-framework/core";

import { env } from "../env.ts";
import { dataset } from "./index.ts";

/** The administrator of the environment (`ADMIN_USERNAME`), who is not a dataset user. */
export const ADMINISTRATOR: Credentials = { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD };

/**
 * The store administrator of the dataset, a platform administrator. Tests arrange data, read the notification journal
 * and clean up as this user.
 */
export const STORE_ADMINISTRATOR: Credentials = credentialsOf("acme_store_administrator@acme.com");

/**
 * Returns the sign-in data of a dataset user.
 *
 * @remarks
 * The sign-in data includes the store of the user, because the platform signs in a customer only to a store.
 *
 * @param userName - The user name of the user.
 * @returns The user name, the password and the store of the user.
 * @throws {Error} The dataset has no such user, or the user has no password.
 */
export function credentialsOf(userName: string): Credentials {
  const user = dataset.users.filter((record) => record.userName === userName)[0];
  if (user === undefined) {
    throw new Error(`The dataset has no user "${userName}"`);
  }
  if (typeof user.password !== "string") {
    throw new Error(`The dataset user "${userName}" has no password`);
  }
  const password = Secret.of(user.password);
  return typeof user.storeId === "string"
    ? { username: userName, password, storeId: user.storeId }
    : { username: userName, password };
}

/**
 * Returns the sign-in data of every dataset user.
 *
 * @returns The user name and the password of each user, in file order.
 * @throws {Error} A user has no user name or no password.
 */
export function datasetUsers(): Credentials[] {
  return dataset.users.all().map((user) => {
    if (typeof user.userName !== "string") {
      throw new Error(`The dataset user "${user.id ?? "(no id)"}" has no user name`);
    }
    return credentialsOf(user.userName);
  });
}

/** The maintainer of the store's organization in the dataset, who manages its contacts and sees its orders. */
export const ORGANIZATION_MAINTAINER: Credentials = credentialsOf("acme_store_maintainer_1@acme.com");

/** An employee of the store's organization in the dataset. */
export const ORGANIZATION_EMPLOYEE: Credentials = credentialsOf("acme_store_employee_1@acme.com");

/** An employee of an organization of another store in the dataset. */
export const OTHER_STORE_EMPLOYEE: Credentials = credentialsOf("other_store_employee_1@other-store.com");
