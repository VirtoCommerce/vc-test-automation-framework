import type { ApiSession } from "@api/api-session";
import type { DynamicProperty, DynamicPropertyData } from "@api/rest/types/platform";
import type { SettingEntry } from "@api/rest/types/settings";
import type { Store } from "@api/rest/types/store";
import type { WhiteLabelingSetting, WhiteLabelingSettingData } from "@api/rest/types/white-labeling";
import type { CleanupStack } from "@core/cleanup-stack";
import type { WithRequired } from "@core/required-fields";
import type { Dictionary, DictionaryEntry } from "../builders/core";
import type { StoreUnderTest } from "../store-under-test";
import type { ArrangeContext } from "./context";

import { randomUUID } from "node:crypto";

import { requireDefined, requireFields } from "@core/required-fields";
import { uniqueId } from "@core/unique-id";

import { newStore } from "../builders/store";

/** Arranges stores, store and global settings, dictionary entries, dynamic properties and white-labeling. */
export class PlatformArrange {
  readonly #admin: ApiSession;
  readonly #cleanup: CleanupStack;
  readonly #store: StoreUnderTest;

  constructor({ admin, cleanup, store }: ArrangeContext) {
    this.#admin = admin;
    this.#cleanup = cleanup;
    this.#store = store;
  }

  /** Creates an extra open store on the catalog of the store under test and deletes it after the test. */
  async store(): Promise<Store> {
    const { stores } = this.#admin.rest;
    const draft = newStore(this.#store.catalog);
    this.#cleanup.push(`delete store ${draft.id}`, () => stores.delete([draft.id]));
    return stores.create(draft);
  }

  /**
   * Sets a setting of the store under test and restores its value (or default) after the test.
   * Use {@link PlatformArrange#setting} for global platform settings.
   *
   * @param name - Such as `Stores.AllowAnonymousUsers`; must already be among the store's settings.
   * @param restored - Runs after restoring, such as waiting until the platform applies the value.
   */
  async storeSetting(
    name: string,
    value: unknown,
    restored: () => Promise<unknown> = async () => undefined,
  ): Promise<void> {
    const { stores } = this.#admin.rest;
    const storeId = this.#store.id;
    const store = await stores.get(storeId);
    const settings = requireDefined(store.settings, `Settings of store ${storeId}`);
    const original = requireFields(
      settings.find((setting) => setting.name === name),
      ["name"],
      `Setting ${name} of store ${storeId}`,
    );
    const withValue = (settingValue: unknown) =>
      stores.update({
        ...store,
        settings: settings.map((setting) => (setting.name === name ? { ...setting, value: settingValue } : setting)),
      });
    this.#cleanup.push(`restore store setting ${name}`, async () => {
      await withValue(original.value ?? original.defaultValue);
      await restored();
    });
    await withValue(value);
  }

  /**
   * Saves a global platform setting now and restores it after the test, for settings the code under test
   * changes. Only for the isolated project.
   *
   * @param name - Such as `Inventory.LogInventoryChanges`.
   * @returns The setting as it is now.
   */
  async restoreSettingLater(name: string): Promise<SettingEntry> {
    const { settings } = this.#admin.rest;
    const original = await settings.get(name);
    this.#cleanup.push(`restore setting ${name}`, () => settings.save([original]));
    return original;
  }

  /**
   * Sets a global platform setting and restores it after the test. Only for the isolated project; use
   * {@link PlatformArrange#storeSetting} for store settings.
   *
   * @param name - Such as `CatalogPersonalization.TagsInheritancePolicy`.
   */
  async setting(name: string, value: unknown): Promise<void> {
    const original = await this.restoreSettingLater(name);
    await this.#admin.rest.settings.save([{ ...original, value }]);
  }

  /**
   * Removes values from a global setting's allowed values after the test, for values the code under test adds.
   * Only for the isolated project.
   *
   * @param name - Such as `Catalog.EditorialReviewTypes`.
   */
  removeAllowedValuesLater(name: string, values: readonly string[]): void {
    const { settings } = this.#admin.rest;
    this.#cleanup.push(`remove ${values.join(", ")} from ${name}`, async () => {
      const setting = await settings.get(name);
      const allowedValues = (setting.allowedValues ?? []).filter((value) => !values.includes(String(value)));
      await settings.save([{ ...setting, allowedValues }]);
    });
  }

  /**
   * Ensures a value is among a global setting's allowed values; if added, it is removed after the test.
   * Only for the isolated project.
   *
   * @param name - Such as `Customer.MemberGroups`.
   */
  async allowedValue(name: string, value: string): Promise<void> {
    const { settings } = this.#admin.rest;
    const setting = await settings.get(name);
    const allowedValues = setting.allowedValues ?? [];
    if (allowedValues.map(String).includes(value)) {
      return;
    }
    this.removeAllowedValuesLater(name, [value]);
    await settings.save([{ ...setting, allowedValues: [...allowedValues, value] }]);
  }

  /**
   * Adds an entry to a platform dictionary, such as a currency or package type, and deletes it after the test.
   *
   * @param dictionary - Such as `api.rest.currencies`.
   * @param keyed - Entry and key from a builder such as `newCurrency()`.
   */
  async dictionaryEntry(dictionary: Dictionary, keyed: DictionaryEntry): Promise<DictionaryEntry> {
    this.#cleanup.push(`delete dictionary entry ${keyed.key}`, () => dictionary.delete([keyed.key]));
    await dictionary.create(keyed.entry);
    return keyed;
  }

  /**
   * Creates a uniquely named dynamic property and deletes it after the test.
   *
   * @param objectType - Such as `VirtoCommerce.CustomerModule.Core.Model.Contact`.
   * @param overrides - Fields that differ from a plain `ShortText` property.
   */
  async dynamicProperty(
    objectType: string,
    overrides: Partial<Omit<DynamicPropertyData, "id">> = {},
  ): Promise<DynamicProperty> {
    const { dynamicProperties } = this.#admin.rest;
    const draft: WithRequired<DynamicPropertyData, "id"> = {
      id: randomUUID(),
      objectType,
      name: uniqueId("test_property"),
      valueType: "ShortText",
      ...overrides,
    };
    this.#cleanup.push(`delete dynamic property ${draft.name}`, () => dynamicProperties.delete([draft.id]));
    return dynamicProperties.create(draft);
  }

  /**
   * Creates an enabled white-labeling setting; the platform cannot delete it, so it is disabled after the test.
   *
   * @param setting - Such as an organization's logo and menus.
   */
  async whiteLabeling(setting: WhiteLabelingSettingData): Promise<WhiteLabelingSetting> {
    const { settings } = this.#admin.rest.whiteLabeling;
    const created = await settings.create({ ...setting, isEnabled: true });
    this.#cleanup.push(`turn off white-labeling setting ${created.id}`, () =>
      settings.update({ ...created, isEnabled: false }),
    );
    return created;
  }
}
