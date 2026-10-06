import type { SettingsClient } from "@api/rest/clients/settings-client";
import type { SettingEntry } from "@api/rest/types/settings";
import type { CleanupStack } from "@core/cleanup-stack";

export async function registerSettingRestore(
  settingsClient: SettingsClient,
  cleanupStack: CleanupStack,
  name: string,
): Promise<SettingEntry> {
  const original = await settingsClient.get(name);
  const restored = { ...original, value: original.value ?? original.defaultValue };
  cleanupStack.push(`restore setting ${name}`, () => settingsClient.save([restored]));
  return original;
}

export async function arrangeSettingValue(
  settingsClient: SettingsClient,
  cleanupStack: CleanupStack,
  name: string,
  value: string,
): Promise<void> {
  const current = await settingsClient.get(name);
  if (allowedValuesOf(current).includes(value)) {
    return;
  }
  registerSettingValuesRemoval(settingsClient, cleanupStack, name, [value]);
  await settingsClient.save([{ ...current, allowedValues: [...allowedValuesOf(current), value] }]);
}

export function registerSettingValuesRemoval(
  settingsClient: SettingsClient,
  cleanupStack: CleanupStack,
  name: string,
  values: readonly string[],
): void {
  cleanupStack.push(`remove ${values.join(", ")} from setting ${name}`, async () => {
    const current = await settingsClient.get(name);
    const remaining = allowedValuesOf(current).filter((value) => !values.includes(String(value)));
    if (remaining.length !== allowedValuesOf(current).length) {
      await settingsClient.save([{ ...current, allowedValues: remaining }]);
    }
  });
}

export async function addSettingValue(settingsClient: SettingsClient, name: string, value: string): Promise<void> {
  const current = await settingsClient.get(name);
  await settingsClient.save([{ ...current, allowedValues: [...allowedValuesOf(current), value] }]);
}

export async function replaceSettingValue(
  settingsClient: SettingsClient,
  name: string,
  value: string,
  replacement: string,
): Promise<void> {
  const current = await settingsClient.get(name);
  const allowedValues = allowedValuesOf(current).map((entry) => (entry === value ? replacement : entry));
  await settingsClient.save([{ ...current, allowedValues }]);
}

function allowedValuesOf(setting: SettingEntry): readonly unknown[] {
  return setting.allowedValues ?? [];
}
