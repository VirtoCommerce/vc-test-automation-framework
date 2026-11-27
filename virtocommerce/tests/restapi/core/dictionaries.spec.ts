import type { Dictionary, DictionaryEntry } from "@builders/core.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { CURRENCIES, newCurrency, newPackageType, PACKAGE_TYPES } from "@builders/core.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";

const DICTIONARIES: readonly {
  readonly name: string;
  readonly dictionary: Dictionary;
  readonly newEntry: () => DictionaryEntry;
}[] = [
  { name: "currency", dictionary: CURRENCIES, newEntry: newCurrency },
  { name: "package type", dictionary: PACKAGE_TYPES, newEntry: newPackageType },
];

for (const { name, dictionary, newEntry } of DICTIONARIES) {
  test.describe(`${name} dictionary (store administrator)`, () => {
    test.use({ user: STORE_ADMINISTRATOR });

    test(`create a ${name}`, async ({ api, arrange }) => {
      const { key, entry } = newEntry();
      arrange.platform.deleteDictionaryEntryLater(dictionary, key);

      await test.step(`act: create a ${name}`, async () =>
        (await api.post(dictionary.path, { json: entry })).expectOk());

      await test.step(`assert: the ${name} is found with its name`, async () => {
        expect(await entryOf(api, dictionary, key)).toMatchObject({ name: entry.name });
      });
    });

    test(`rename a ${name}`, async ({ api, arrange }) => {
      const { key, entry } = await test.step(`arrange: a ${name}`, () =>
        arrange.platform.dictionaryEntry(dictionary, newEntry()));
      const newName = `${entry.name} renamed`;

      await test.step(`act: rename the ${name}`, async () =>
        (await api.put(dictionary.path, { json: { ...entry, name: newName } })).expectOk());

      await test.step(`assert: the ${name} has the new name`, async () => {
        expect((await entryOf(api, dictionary, key))?.["name"]).toBe(newName);
      });
    });

    test(`delete a ${name}`, async ({ api, arrange }) => {
      const { key } = await test.step(`arrange: a ${name}`, () =>
        arrange.platform.dictionaryEntry(dictionary, newEntry()));

      await test.step(`act: delete the ${name}`, async () =>
        (await api.delete(dictionary.path, { query: { [dictionary.deleteQuery]: [key] } })).expectOk());

      await test.step(`assert: the ${name} is not found`, async () => {
        expect(await entryOf(api, dictionary, key)).toBeUndefined();
      });
    });
  });
}

async function entryOf(
  api: HttpClient,
  dictionary: Dictionary,
  key: string,
): Promise<Readonly<Record<string, unknown>> | undefined> {
  const entries = (await api.get(dictionary.path)).expectOk().json<Readonly<Record<string, unknown>>[]>();
  return entries.find((entry) => entry[dictionary.keyField] === key);
}
