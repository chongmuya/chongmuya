export type Event = {
  id: string;
  ownerId: string;
  groupId: string | null;
  version: number;
  reservationScheduleLocked?: boolean;
  name: string;
  expectedGuests: number | null;
  scheduledAt: string | null;
};
export type EventInput = {
  creationKey?: string;
  name: string;
  expectedGuests?: number;
  scheduledAt?: string;
  groupId?: string;
  importGroupRoster?: boolean;
};
