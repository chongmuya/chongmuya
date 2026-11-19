import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { ConfigService } from "../../config/config.service.js";
import { EventsService } from "../events/events.service.js";
import { GroupsService } from "../groups/groups.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { CalendarSchedule } from "./entities/calendar-schedule.entity.js";
import { koreanDate, reminderAt } from "./lib/calendar-time.js";
@Injectable()
export class RemindersService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(RemindersService.name);
  constructor(
    private readonly database: DatabaseService,
    private readonly events: EventsService,
    private readonly groups: GroupsService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}
  onModuleInit() {
    if (this.config.environment.remindersEnabled) {
      this.timer = setInterval(() => {
        void this.tick();
      }, 60000);
      this.timer.unref();
      void this.tick();
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.run();
      if (result.failed)
        this.logger.warn(
          `Reminder batch checked=${result.checked} failed=${result.failed}`,
        );
    } catch {
      this.logger.warn("Reminder batch unavailable; next tick will retry");
    } finally {
      this.running = false;
    }
  }
  async run(now = new Date()) {
    const db = await this.database.connect();
    const result = { checked: 0, failed: 0 };
    for (const kind of ["EVENT", "OTHER"] as const) {
      let after: string | undefined;
      for (;;) {
        const ids =
          kind === "EVENT"
            ? await this.events.reminderCandidates(now, db.manager, after)
            : (
                await db.manager
                  .createQueryBuilder(CalendarSchedule, "s")
                  .where(
                    "s.deletedAt IS NULL AND s.date >= :today AND s.date <= :until",
                    {
                      today: koreanDate(now),
                      until: koreanDate(new Date(now.getTime() + 172800000)),
                    },
                  )
                  .andWhere(after ? "s.id > :after" : "true", { after })
                  .orderBy("s.id", "ASC")
                  .take(100)
                  .getMany()
              ).map((r) => r.id);
        if (!ids.length) break;
        for (const id of ids) {
          try {
            await db.transaction(async (m) => {
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
              if (!date) return;
              const due = reminderAt(date);
              if (due > now || row.updatedAt > due || date <= koreanDate(now))
                return;
              // Resource lock + unique fact are the durable processing receipt. Crash before
              // commit rolls back both; crash after commit is a no-op on the next runner.
              await this.notifications.record(m, {
                eventKey: `reminder:${kind}:${id}:${row.version}`,
                kind: "SCHEDULE_REMINDER",
                category: "EVENT",
                eventId: id,
                requestId: id,
                revision: row.version,
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
        after = ids.at(-1);
        if (ids.length < 100) break;
      }
    }
    return result;
  }
}
