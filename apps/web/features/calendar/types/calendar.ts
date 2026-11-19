export type Schedule = {
  id: string;
  groupId: string | null;
  title: string;
  date: string;
  startsAt: string | null;
  memo: string;
  version: number;
  deletedAt: string | null;
};
export type CalendarData = {
  schedules: Schedule[];
  events: { id: string; name: string; scheduledAt: string; version: number }[];
  reservations?: {
    id: string;
    title: string;
    startsAt: string;
    status: string;
    destination: string;
  }[];
};
export type ScheduleInput = {
  requestKey: string;
  expectedVersion: number;
  groupId?: string;
  title: string;
  date: string;
  startsAt?: string;
  allDay: boolean;
  memo: string;
};
