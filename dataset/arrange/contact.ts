import type { InputMemberAddressType, MemberAddressFragment } from "@api/graphql/generated/graphql";
import type { GraphqlClient } from "@api/graphql/graphql-client";
import type { MemberAddressDraft } from "../builders/address";

import { UpdateMemberAddressesDocument } from "@api/graphql/generated/graphql";
import { requireFields } from "@core/required-fields";

import { addressDescribedAs } from "../builders/address";

export type SavedMemberAddress = MemberAddressFragment & {
  readonly id: string;
  readonly city: string;
  readonly countryCode: string;
  readonly line1: string;
  readonly description: string;
};

export async function saveMemberAddresses(
  graphqlClient: GraphqlClient,
  memberId: string,
  drafts: readonly MemberAddressDraft[],
): Promise<SavedMemberAddress[]> {
  const { updateMemberAddresses } = await graphqlClient.execute(UpdateMemberAddressesDocument, {
    command: { memberId, addresses: [...drafts] },
  });
  const saved = updateMemberAddresses?.addresses?.items;
  return drafts.map((draft) =>
    requireFields(
      addressDescribedAs(saved, draft.description),
      ["id", "city", "countryCode", "line1", "description"],
      `Saved address ${draft.description}`,
    ),
  );
}

export async function saveMemberAddress(
  graphqlClient: GraphqlClient,
  memberId: string,
  draft: MemberAddressDraft,
): Promise<SavedMemberAddress> {
  const [saved] = await saveMemberAddresses(graphqlClient, memberId, [draft]);
  return requireFields(saved, ["id"], `Saved address ${draft.description}`);
}

export function toMemberAddressInput({
  isDefault: _isDefault,
  isFavorite: _isFavorite,
  ...address
}: SavedMemberAddress): InputMemberAddressType {
  return address;
}
