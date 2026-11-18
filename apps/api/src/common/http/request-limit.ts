import { HttpException } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { EntityManager } from "typeorm";

// Shared atomic fixed-window limit. Execute outside the business transaction so
// rejected identification/writes do not roll back the attempt count.
export async function consumeRequestLimit(
  manager: EntityManager,
  key: string,
  maximum: number,
) {
  const rows = await manager.query<{ count: number }[]>(
    `
    INSERT INTO auth_attempts (key, count, "resetsAt") VALUES ($1, 1, now() + interval '15 minutes')
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN auth_attempts."resetsAt" <= now() THEN 1 ELSE auth_attempts.count + 1 END,
      "resetsAt" = CASE WHEN auth_attempts."resetsAt" <= now() THEN now() + interval '15 minutes' ELSE auth_attempts."resetsAt" END
    RETURNING count`,
    [createHash("sha256").update(key).digest("hex")],
  );
  if (rows[0].count > maximum) throw new HttpException("", 429);
}
