export type Event = {
  id: string;
  ownerId: string;
  groupId: string | null;
  version: number;
  reservationScheduleLocked?: boolean;
  name: string;
  scheduledAt: string | null;
};
export type EventInput = {
  creationKey?: string;
  name: string;
  scheduledAt?: string;
  groupId?: string;
  importGroupRoster?: boolean;
};
