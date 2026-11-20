import type { GroupType } from "./group-type";
export type Group = {
  id: string;
  name: string;
  groupType: GroupType | null;
  memberCount: number;
};
export type GroupMember = {
  version: number;
  id: string;
  name: string;
  phoneLast4: string | null;
  label: string | null;
};
export type CreateGroupInput = {
  name: string;
  groupType?: string | null;
  creationKey?: string;
  members?: {
    name: string;
    phoneLast4?: string | null;
    label?: string | null;
  }[];
  duplicatesConfirmed?: boolean;
};

export type AddGroupMembersInput = {
  requestKey: string;
  members: {
    name: string;
    phoneLast4: string | null;
    label: string | null;
    existingMemberId?: string;
  }[];
  duplicatesConfirmed: boolean;
};
export type AddedGroupMembers = { group: Group; addedCount: number };
