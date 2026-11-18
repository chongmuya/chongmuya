import { ApiError } from "./api-error";

export function isAccessError(error: unknown) {
  return error instanceof ApiError && [401, 403, 404].includes(error.status);
}
