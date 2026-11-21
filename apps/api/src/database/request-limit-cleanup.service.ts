import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { DatabaseService } from "./database.service.js";

const CLEANUP_INTERVAL_MS = 60_000;
const CLEANUP_BATCH_SIZE = 5_000;

@Injectable()
export class RequestLimitCleanupService implements OnModuleDestroy {
  private readonly logger = new Logger(RequestLimitCleanupService.name);
  private timer?: ReturnType<typeof setInterval>;
  private active?: Promise<void>;

  constructor(private readonly database: DatabaseService) {}

  start() {
    this.timer ??= setInterval(() => {
      this.active ??= this.deleteExpired().finally(() => {
        this.active = undefined;
      });
    }, CLEANUP_INTERVAL_MS).unref();
  }

  private async deleteExpired() {
    try {
      const db = await this.database.connect();
      // Leave buckets being renewed or cleaned by another process for a later run.
      await db.query(
        `
        WITH expired AS (
          SELECT key FROM auth_attempts
          WHERE "resetsAt" <= now()
          ORDER BY "resetsAt"
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        )
        DELETE FROM auth_attempts AS attempts
        USING expired WHERE attempts.key = expired.key`,
        [CLEANUP_BATCH_SIZE],
      );
    } catch {
      this.logger.warn(
        "code=REQUEST_LIMIT_CLEANUP_FAILED source=RequestLimitCleanupService.deleteExpired",
      );
    }
  }

  async onModuleDestroy() {
    clearInterval(this.timer);
    await this.active;
  }
}
