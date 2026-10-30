import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import type { DataSource } from "typeorm";
import { DatabaseService } from "../../database/database.service.js";

export const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

@Injectable()
export class AuthRepository {
  constructor(private readonly database: DatabaseService) {}
  async run<T>(operation: (db: DataSource) => Promise<T>): Promise<T> {
    try {
      return await operation(await this.database.connect());
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException();
    }
  }
  async limit(key: string, maximum: number) {
    const rows = await this.run((db) =>
      db.query<{ count: number }[]>(
        `
      INSERT INTO auth_attempts (key, count, "resetsAt") VALUES ($1, 1, now() + interval '15 minutes')
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN auth_attempts."resetsAt" <= now() THEN 1 ELSE auth_attempts.count + 1 END,
        "resetsAt" = CASE WHEN auth_attempts."resetsAt" <= now() THEN now() + interval '15 minutes' ELSE auth_attempts."resetsAt" END
      RETURNING count`,
        [tokenHash(key)],
      ),
    );
    if (rows[0].count > maximum) throw new HttpException("", 429);
  }
}
