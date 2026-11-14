export type Event = {
  id: string;
  groupId: string;
  name: string;
  scheduledAt: string | null;
};
export type EventInput = { name: string; scheduledAt?: string };
