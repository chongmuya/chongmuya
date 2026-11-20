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
  events: {
    id: string;
    name: string;
    scheduledAt: string;
    version: number;
    restaurantName: string | null;
  }[];
  reservations?: {
    id: string;
    title: string;
    startsAt: string;
    status: string;
    destination: string;
    expectedGuests: number;
    region: string | null;
    budgetBasis: "PER_PERSON" | "TOTAL" | null;
    budgetAmount: number | null;
    orderTotal: number | null;
    depositAmount: number | null;
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
