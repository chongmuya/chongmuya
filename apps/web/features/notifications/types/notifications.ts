export type InboxItem = {
  id: string;
  sequence: string;
  title: string;
  summary: string;
  destination: string;
  createdAt: string;
  readAt: string | null;
  fact: { kind: string; category: string; eventId: string; revision: number };
};
export type Inbox = {
  items: InboxItem[];
  unread: number;
  through: string;
  next: string | null;
};
export type Preferences = {
  reservation: boolean;
  settlement: boolean;
  event: boolean;
  version: number;
};
