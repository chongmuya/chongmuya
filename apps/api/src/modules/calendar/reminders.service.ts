import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { EventsService } from "../events/events.service.js";
import { GroupsService } from "../groups/groups.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { CalendarSchedule } from "./entities/calendar-schedule.entity.js";
import { koreanDate, reminderBatch } from "./lib/calendar-time.js";
@Injectable()
export class RemindersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly events: EventsService,
    private readonly groups: GroupsService,
    private readonly notifications: NotificationsService,
  ) {}
  async run(now = new Date(), isActive: () => boolean = () => true) {
    const batch = reminderBatch(now);
    const result = { checked: 0, failed: 0 };
    if (now < batch.due || !isActive()) return result;
    const db = await this.database.connect();
    for (const kind of ["EVENT", "OTHER"] as const) {
      let after: string | undefined;
      for (;;) {
        if (!isActive()) return result;
        const candidates =
          kind === "EVENT"
            ? await this.events.reminderCandidates(batch, db.manager, after)
            : (
                await db.manager
                  .createQueryBuilder(CalendarSchedule, "s")
                  .select(["s.id", "s.scheduleRevision"])
                  .where("s.deletedAt IS NULL AND s.date = :targetDate", batch)
                  .andWhere("s.scheduleUpdatedAt <= :due", batch)
                  .andWhere(after ? "s.id > :after" : "true", { after })
                  .orderBy("s.id", "ASC")
                  .take(100)
                  .getMany()
              ).map((r) => ({ id: r.id, revision: r.scheduleRevision }));
        if (!candidates.length) break;
        const recorded = await this.notifications.recordedEventKeys(
          candidates.map(
            ({ id, revision }) => `reminder:${kind}:${id}:${revision}`,
          ),
          db.manager,
        );
        for (const { id, revision } of candidates) {
          if (!isActive()) return result;
          if (recorded.has(`reminder:${kind}:${id}:${revision}`)) continue;
          try {
            await db.transaction(async (m) => {
              if (kind === "OTHER") {
                const seed = await m.findOneBy(CalendarSchedule, { id });
                if (seed?.groupId) await this.groups.lock(seed.groupId, m);
              }
              const row =
                kind === "EVENT"
                  ? await this.events.reminderCurrent(id, m)
                  : await m.findOne(CalendarSchedule, {
                      where: { id },
                      lock: { mode: "pessimistic_write" },
                    });
              if (!row || ("deletedAt" in row && row.deletedAt)) return;
              if (row instanceof CalendarSchedule && row.groupId)
                await this.groups.assertOwned(row.ownerId, row.groupId, m);
              const date =
                row instanceof CalendarSchedule
                  ? row.date
                  : row.startsAt
                    ? koreanDate(row.startsAt)
                    : null;
              if (date !== batch.targetDate) return;
              const changedAt =
                row instanceof CalendarSchedule
                  ? row.scheduleUpdatedAt
                  : row.updatedAt;
              const revision =
                row instanceof CalendarSchedule
                  ? row.scheduleRevision
                  : row.version;
              if (changedAt > batch.due || !isActive()) return;
              // Settings/inbox writes can hold the recipient lock across midnight too.
              // record() reuses this transaction's lock before its final deduplication.
              await this.notifications.lockAccount(m, row.ownerId);
              if (!isActive()) return;
              // Resource lock + unique fact are the durable processing receipt. Crash before
              // commit rolls back both; crash after commit is a no-op on the next runner.
              await this.notifications.record(m, {
                eventKey: `reminder:${kind}:${id}:${revision}`,
                kind: "SCHEDULE_REMINDER",
                category: "EVENT",
                eventId: id,
                requestId: id,
                revision,
                accounts: [
                  {
                    id: row.ownerId,
                    title: "내일 일정이 있어요",
                    summary: row.title,
                    destination:
                      kind === "EVENT"
                        ? `/events?event=${id}`
                        : `/calendar?schedule=${id}`,
                  },
                ],
                messages: [],
              });
            });
            result.checked++;
          } catch {
            result.failed++;
          }
        }
        after = candidates.at(-1)!.id;
        if (candidates.length < 100) break;
      }
    }
    return result;
  }
}
