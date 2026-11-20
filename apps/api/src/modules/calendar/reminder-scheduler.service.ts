import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { Cron, SchedulerRegistry } from "@nestjs/schedule";
import { ConfigService } from "../../config/config.service.js";
import {
  koreanDate,
  reminderBatch,
  REMINDER_HOUR,
  REMINDER_TIME_ZONE,
} from "./lib/calendar-time.js";
import { RemindersService } from "./reminders.service.js";

export const REMINDER_JOB = "calendar-reminders";
const RETRY_DELAYS = [60_000, 300_000, 900_000] as const;
type Batch = { date: string; at: Date; attempts: number };

@Injectable()
export class ReminderSchedulerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ReminderSchedulerService.name);
  private batch?: Batch;
  private active?: Promise<void>;
  private retry?: ReturnType<typeof setTimeout>;
  private stopping = false;

  constructor(
    private readonly reminders: RemindersService,
    private readonly config: ConfigService,
    private readonly registry: SchedulerRegistry,
  ) {}

  onApplicationBootstrap() {
    // The job is mounted disabled, so no automatic work precedes this config check.
    if (!this.config.environment.remindersEnabled || this.stopping) return;
    this.registry.getCronJob(REMINDER_JOB).start();
    void this.startToday();
  }

  @Cron(`0 0 ${REMINDER_HOUR} * * *`, {
    name: REMINDER_JOB,
    timeZone: REMINDER_TIME_ZONE,
    disabled: true,
    waitForCompletion: true,
  })
  startToday(): Promise<void> | undefined {
    if (!this.config.environment.remindersEnabled || this.stopping) return;
    const now = new Date();
    const { date, due } = reminderBatch(now);
    if (now < due || this.active || this.batch?.date === date) return;
    this.cancelRetry();
    this.batch = { date, at: now, attempts: 0 };
    return this.execute(this.batch);
  }

  private isActive(batch: Batch) {
    return !this.stopping && koreanDate(new Date()) === batch.date;
  }

  private execute(batch: Batch) {
    if (this.active || !this.isActive(batch)) return;
    this.cancelRetry();
    this.active = this.attempt(batch).finally(() => {
      this.active = undefined;
    });
    return this.active;
  }

  private async attempt(batch: Batch) {
    batch.attempts++;
    let failed: boolean;
    try {
      const result = await this.reminders.run(batch.at, () =>
        this.isActive(batch),
      );
      failed = result.failed > 0;
    } catch {
      // Includes connection/candidate lookup failure. Never log the original error.
      failed = true;
    }
    if (!failed || !this.isActive(batch)) return;
    const delay = RETRY_DELAYS[batch.attempts - 1];
    if (delay === undefined) {
      this.logger.error(
        `requestId=reminder:${batch.date} code=REMINDER_RETRIES_EXHAUSTED source=ReminderSchedulerService.attempt`,
      );
      return;
    }
    this.logger.warn(
      `requestId=reminder:${batch.date} code=REMINDER_RETRY_SCHEDULED source=ReminderSchedulerService.attempt`,
    );
    this.retry = setTimeout(() => {
      this.retry = undefined;
      void this.execute(batch);
    }, delay);
    this.retry.unref();
  }

  private cancelRetry() {
    if (this.retry) clearTimeout(this.retry);
    this.retry = undefined;
  }

  async onModuleDestroy() {
    this.stopping = true;
    this.cancelRetry();
    const stopped = this.registry.doesExist("cron", REMINDER_JOB)
      ? this.registry.getCronJob(REMINDER_JOB).stop()
      : undefined;
    await this.active;
    await stopped;
  }
}
