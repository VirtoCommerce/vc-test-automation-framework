import type { Dictionary, DictionaryEntry } from "../builders/core.ts";
import type { StoreDraft } from "../builders/store.ts";
import type {
  VirtoCommercePlatformCoreDynamicPropertiesDynamicProperty as DynamicProperty,
  VirtoCommerceStoreModuleCoreModelStore as Store,
  VirtoCommerceWhiteLabelingCoreModelsWhiteLabelingSetting as WhiteLabelingSetting,
} from "../rest/generated/platform.ts";
import type { WithRequired } from "../support/require-fields.ts";
import type { PlatformSetting } from "../support/settings.ts";
import type { ArrangeContext } from "./context.ts";

import { randomUUID } from "node:crypto";

import { newStore } from "../builders/store.ts";
import { requireFields } from "../support/require-fields.ts";
import { saveSetting, settingOf } from "../support/settings.ts";
import { uniqueId } from "../support/unique-id.ts";

/** A dynamic property as the platform saved it. */
export type ArrangedDynamicProperty = WithRequired<DynamicProperty, "id" | "name">;

/** Arranges stores, dynamic properties, dictionary entries and white-labeling settings. */
export interface PlatformArrange {
  /** Creates an open store with the catalog of the store under test and deletes it after the test. */
  store(): Promise<StoreDraft>;
  /** Deletes a store after the test, such as one that the code under test creates. */
  deleteStoreLater(storeId: string): void;
  /**
   * Creates a short text dynamic property of an object type and deletes it after the test.
   *
   * @param objectType - The full name of the type, such as `VirtoCommerce.StoreModule.Core.Model.Store`.
   * @param overrides - Fields to change, such as `name`.
   */
  dynamicProperty(objectType: string, overrides?: Partial<DynamicProperty>): Promise<ArrangedDynamicProperty>;
  /** Deletes a dynamic property after the test, such as one that the code under test creates. */
  deleteDynamicPropertyLater(propertyId: string): void;
  /** Creates an entry of a dictionary, such as a currency, and deletes it after the test. */
  dictionaryEntry(dictionary: Dictionary, keyed: DictionaryEntry): Promise<DictionaryEntry>;
  /** Deletes an entry of a dictionary after the test, such as one that the code under test creates. */
  deleteDictionaryEntryLater(dictionary: Dictionary, key: string): void;
  /**
   * Creates an enabled white-labeling setting, such as an organization's logo and menus. The platform cannot delete
   * it, so it is turned off after the test.
   */
  whiteLabeling(setting: WhiteLabelingSetting): Promise<WhiteLabelingSetting>;
  /**
   * Changes a global platform setting and restores it after the test. Global settings affect every test, so only
   * the isolated project changes them.
   */
  setting(name: string, value: unknown): Promise<void>;
  /**
   * Restores a global platform setting after the test, such as one that the code under test changes.
   *
   * @returns The setting as it was.
   */
  restoreSettingLater(name: string): Promise<PlatformSetting>;
  /** Adds a value to the allowed values of a global setting, unless it has it, and removes it after the test. */
  allowedValue(name: string, value: string): Promise<void>;
  /** Removes values from the allowed values of a global setting after the test, such as values the test adds. */
  removeAllowedValuesLater(name: string, values: readonly string[]): void;
  /**
   * Changes a setting of the store under test and restores it after the test.
   *
   * @param restored - Waits after the restore until the platform applies it, such as a cached store setting.
   */
  storeSetting(name: string, value: unknown, restored?: () => Promise<unknown>): Promise<void>;
}

const STORES_PATH = "/api/stores";
const DYNAMIC_PROPERTIES_PATH = "/api/platform/dynamic/properties";
const WHITE_LABELING_PATH = "/api/white-labeling";

/**
 * Returns the platform methods of `arrange`.
 *
 * @param context - What the methods create and remove data with.
 * @returns The methods.
 */
export function platformArrange({ admin, store: storeUnderTest, later }: ArrangeContext): PlatformArrange {
  async function store(): Promise<StoreDraft> {
    const draft = newStore(storeUnderTest.catalog);
    (await (await admin()).post(STORES_PATH, { json: draft })).expectOk();
    deleteStoreLater(draft.id);
    return draft;
  }

  function deleteStoreLater(storeId: string): void {
    later(`delete store ${storeId}`, async () =>
      (await (await admin()).delete(STORES_PATH, { query: { ids: [storeId] } })).expectOk(),
    );
  }

  async function dynamicProperty(
    objectType: string,
    overrides: Partial<DynamicProperty> = {},
  ): Promise<ArrangedDynamicProperty> {
    const draft = {
      id: randomUUID(),
      objectType,
      name: uniqueId("test_property"),
      valueType: "ShortText",
      ...overrides,
    };
    const created = (await (await admin()).post(DYNAMIC_PROPERTIES_PATH, { json: draft }))
      .expectOk()
      .json<DynamicProperty>();
    const property = requireFields(created, ["id", "name"], `Dynamic property ${draft.name}`);
    deleteDynamicPropertyLater(property.id);
    return property;
  }

  function deleteDynamicPropertyLater(propertyId: string): void {
    later(`delete dynamic property ${propertyId}`, async () =>
      (await (await admin()).delete(DYNAMIC_PROPERTIES_PATH, { query: { propertyIds: [propertyId] } })).expectOk(),
    );
  }

  async function dictionaryEntry(dictionary: Dictionary, keyed: DictionaryEntry): Promise<DictionaryEntry> {
    (await (await admin()).post(dictionary.path, { json: keyed.entry })).expectOk();
    deleteDictionaryEntryLater(dictionary, keyed.key);
    return keyed;
  }

  function deleteDictionaryEntryLater(dictionary: Dictionary, key: string): void {
    later(`delete ${key} from ${dictionary.path}`, async () =>
      (await (await admin()).delete(dictionary.path, { query: { [dictionary.deleteQuery]: [key] } })).expectOk(),
    );
  }

  async function whiteLabeling(setting: WhiteLabelingSetting): Promise<WhiteLabelingSetting> {
    const client = await admin();
    const created = (await client.post(WHITE_LABELING_PATH, { json: { ...setting, isEnabled: true } }))
      .expectOk()
      .json<WhiteLabelingSetting>();
    later(`turn off white-labeling setting ${created.id}`, async () =>
      (await client.put(WHITE_LABELING_PATH, { json: { ...created, isEnabled: false } })).expectOk(),
    );
    return created;
  }

  async function setting(name: string, value: unknown): Promise<void> {
    const original = await restoreSettingLater(name);
    await saveSetting(await admin(), { ...original, value });
  }

  async function restoreSettingLater(name: string): Promise<PlatformSetting> {
    const original = await settingOf(await admin(), name);
    later(`restore setting ${name}`, async () => saveSetting(await admin(), original));
    return original;
  }

  async function allowedValue(name: string, value: string): Promise<void> {
    const current = await settingOf(await admin(), name);
    const allowedValues = current.allowedValues ?? [];
    if (allowedValues.map(String).includes(value)) {
      return;
    }
    removeAllowedValuesLater(name, [value]);
    await saveSetting(await admin(), { ...current, allowedValues: [...allowedValues, value] });
  }

  function removeAllowedValuesLater(name: string, values: readonly string[]): void {
    later(`remove ${values.join(", ")} from ${name}`, async () => {
      const current = await settingOf(await admin(), name);
      const allowedValues = (current.allowedValues ?? []).filter((value) => !values.includes(String(value)));
      await saveSetting(await admin(), { ...current, allowedValues });
    });
  }

  async function storeSetting(
    name: string,
    value: unknown,
    restored: () => Promise<unknown> = async () => undefined,
  ): Promise<void> {
    const client = await admin();
    const path = `${STORES_PATH}/${encodeURIComponent(storeUnderTest.id)}`;
    const current = (await client.get(path)).expectOk().json<Store>();
    const original = requireFields(
      (current.settings ?? []).find((entry) => entry.name === name),
      ["name"],
      `Setting ${name} of store ${storeUnderTest.id}`,
    );
    const withValue = async (settingValue: unknown) =>
      (
        await client.put(STORES_PATH, {
          json: {
            ...current,
            settings: (current.settings ?? []).map((entry) =>
              entry.name === name ? { ...entry, value: settingValue } : entry,
            ),
          },
        })
      ).expectOk();
    later(`restore store setting ${name}`, async () => {
      await withValue(original.value ?? original.defaultValue);
      await restored();
    });
    await withValue(value);
  }

  return {
    store,
    deleteStoreLater,
    dynamicProperty,
    deleteDynamicPropertyLater,
    dictionaryEntry,
    deleteDictionaryEntryLater,
    whiteLabeling,
    setting,
    restoreSettingLater,
    allowedValue,
    removeAllowedValuesLater,
    storeSetting,
  };
}
