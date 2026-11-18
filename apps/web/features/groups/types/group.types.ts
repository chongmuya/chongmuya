export type Group = {
  id: string;
  name: string;
  groupType: string | null;
  memberCount: number;
};
export type GroupMember = {
  id: string;
  name: string;
  phoneLast4: string | null;
};
export type CreateGroupInput = {
  name: string;
  groupType?: string | null;
  creationKey?: string;
  members?: { name: string; phoneLast4?: string | null }[];
  duplicatesConfirmed?: boolean;
};
