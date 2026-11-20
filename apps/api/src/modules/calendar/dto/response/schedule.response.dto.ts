import type { CalendarSchedule } from "../../entities/calendar-schedule.entity.js";

export function scheduleDto(row: CalendarSchedule) {
  return {
    id: row.id,
    groupId: row.groupId,
    title: row.title,
    date: row.date,
    startsAt: row.startsAt,
    memo: row.memo,
    version: row.version,
    deletedAt: row.deletedAt,
  };
}
