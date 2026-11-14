import type { FieldError } from "./error-contract";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
    readonly fieldErrors?: FieldError[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}
