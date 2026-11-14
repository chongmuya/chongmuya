import { QueryFailedError } from "typeorm";

// Only known driver availability failures are retryable. Constraint, schema,
// metadata and programming errors must not masquerade as an outage.
const unavailableCodes = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
  "53300",
  "57P01",
  "57P02",
  "57P03",
  "57014",
]);
const unavailableMessages = new Set([
  "Connection terminated unexpectedly",
  "Connection terminated",
  "timeout exceeded when trying to connect",
  "Connection terminated due to connection timeout",
]);

export function databaseErrorCode(error: unknown): string | undefined {
  const cause: unknown =
    error instanceof QueryFailedError ? error.driverError : error;
  if (!(cause instanceof Error) || !("code" in cause)) return undefined;
  const code = cause.code;
  // Do not allow arbitrary values (including credentials) into diagnostics.
  return typeof code === "string" &&
    (unavailableCodes.has(code) ||
      [
        "08P01",
        "23505",
        "23503",
        "23502",
        "23514",
        "42601",
        "42P01",
        "42703",
        "40001",
        "40P01",
        "P0001",
        "28P01",
        "3D000",
      ].includes(code))
    ? code
    : undefined;
}

export function isDatabaseUnavailable(error: unknown): boolean {
  const code = databaseErrorCode(error);
  if (code && unavailableCodes.has(code)) return true;
  const cause: unknown =
    error instanceof QueryFailedError ? error.driverError : error;
  if (cause instanceof AggregateError)
    return cause.errors.length > 0 && cause.errors.every(isDatabaseUnavailable);
  // pg-pool sometimes reports a disconnect/timeout without a code.
  return cause instanceof Error && unavailableMessages.has(cause.message);
}
