import { HttpException, Injectable } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import { tokenHash } from "../utils/token-hash.js";

// Atomic rate-limit upsert is the only specialized query here. Caller owns connection/transaction.
@Injectable()
export class AuthAttemptsRepository {
  async limit(manager: EntityManager, key: string, maximum: number) {
    const rows = await manager.query<{ count: number }[]>(
      `
      INSERT INTO auth_attempts (key, count, "resetsAt") VALUES ($1, 1, now() + interval '15 minutes')
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN auth_attempts."resetsAt" <= now() THEN 1 ELSE auth_attempts.count + 1 END,
        "resetsAt" = CASE WHEN auth_attempts."resetsAt" <= now() THEN now() + interval '15 minutes' ELSE auth_attempts."resetsAt" END
      RETURNING count`,
      [tokenHash(key)],
    );
    if (rows[0].count > maximum) throw new HttpException("", 429);
  }
}
