import type { WhiteLabelingClient } from "@api/rest/clients/white-labeling-client";
import type { WhiteLabelingSetting, WhiteLabelingSettingData } from "@api/rest/types/white-labeling";
import type { CleanupStack } from "@core/cleanup-stack";

export async function arrangeWhiteLabeling(
  whiteLabelingClient: WhiteLabelingClient,
  cleanupStack: CleanupStack,
  setting: WhiteLabelingSettingData,
): Promise<WhiteLabelingSetting> {
  const created = await whiteLabelingClient.create({ ...setting, isEnabled: true });
  cleanupStack.push(`disable white-labeling setting ${created.id}`, () =>
    whiteLabelingClient.update({ ...created, isEnabled: false }),
  );
  return created;
}
