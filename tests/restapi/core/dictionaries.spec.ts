import type { RestApi } from "@api/rest/rest-api";
import type { Dictionary, DictionaryEntry } from "@dataset/builders/core";

import * as allure from "allure-js-commons";

import { newCurrency, newPackageType } from "@dataset/builders/core";
import { expect, test } from "@fixtures";

const DICTIONARIES: readonly {
  readonly dictionary: string;
  readonly resource: (rest: RestApi) => Dictionary;
  readonly newEntry: () => DictionaryEntry;
}[] = [
  { dictionary: "currency", resource: (rest) => rest.currencies, newEntry: newCurrency },
  { dictionary: "package type", resource: (rest) => rest.packageTypes, newEntry: newPackageType },
];

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Core / Dictionaries");
});

for (const { dictionary, resource, newEntry } of DICTIONARIES) {
  test.describe(`${dictionary} dictionary (store administrator)`, () => {
    test.use({ user: "acme_store_administrator@acme.com" });

    test(`create a ${dictionary}`, async ({ api, cleanup }) => {
      await allure.story("Create");
      await allure.description(`A new ${dictionary} is found by its key, with its name.`);
      const { key, entry } = newEntry();
      cleanup.push(`delete ${dictionary} ${key}`, () => resource(api.rest).delete([key]));

      await test.step(`act: create a ${dictionary}`, () => resource(api.rest).create(entry));

      await test.step(`assert: the ${dictionary} is found with its name`, async () => {
        expect(await resource(api.rest).find(key)).toMatchObject({ name: entry.name });
      });
    });

    test(`rename a ${dictionary}`, async ({ api, arrange }) => {
      await allure.story("Update");
      await allure.description(`A renamed ${dictionary} is found with its new name.`);
      const { key, entry } = await test.step(`arrange: a ${dictionary}`, () =>
        arrange.platform.dictionaryEntry(resource(api.rest), newEntry()));
      const newName = `${entry.name} renamed`;

      await test.step(`act: rename the ${dictionary}`, () => resource(api.rest).update({ ...entry, name: newName }));

      await test.step(`assert: the ${dictionary} has the new name`, async () => {
        expect((await resource(api.rest).find(key))?.name).toBe(newName);
      });
    });

    test(`delete a ${dictionary}`, async ({ api, arrange }) => {
      await allure.story("Delete");
      await allure.description(`A deleted ${dictionary} is no longer found.`);
      const { key } = await test.step(`arrange: a ${dictionary}`, () =>
        arrange.platform.dictionaryEntry(resource(api.rest), newEntry()));

      await test.step(`act: delete the ${dictionary}`, () => resource(api.rest).delete([key]));

      await test.step(`assert: the ${dictionary} is not found`, async () => {
        expect(await resource(api.rest).find(key)).toBeUndefined();
      });
    });
  });
}
