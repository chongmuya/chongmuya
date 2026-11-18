export type Event = {
  id: string;
  ownerId: string;
  groupId: string | null;
  version: number;
  name: string;
  scheduledAt: string | null;
};
export type EventInput = {
  name: string;
  scheduledAt?: string;
  groupId?: string;
};
