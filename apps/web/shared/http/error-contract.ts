import { messages } from "./error-messages";
import { z } from "zod";
import { ApiError } from "./api-error";

export const fieldErrorSchema = z
  .object({
    field: z
      .string()
      .max(100)
      .regex(/^[a-zA-Z]\w*(?:\.[a-zA-Z]\w*)*$/)
      .refine(
        (value) =>
          !value
            .split(".")
            .some((part) =>
              ["__proto__", "prototype", "constructor"].includes(part),
            ),
      ),
    code: z.enum([
      "INVALID_TYPE",
      "INVALID_LENGTH",
      "INVALID_EMAIL",
      "INVALID_UUID",
      "INVALID_FORMAT",
      "INVALID_VALUE",
    ]),
  })
  .strict();
export type FieldError = z.infer<typeof fieldErrorSchema>;

const errorSchema = z
  .object({
    statusCode: z.number().int().min(400).max(599),
    code: z.string().max(64),
    message: z.string().max(300),
    requestId: z.uuid(),
    fieldErrors: z.array(fieldErrorSchema).max(50).optional(),
  })
  .strict();

export function safeErrorMessage(error: unknown) {
  return error instanceof ApiError &&
    messages[error.code]?.status === error.status
    ? messages[error.code].message
    : "요청을 완료하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.";
}

export function parseApiError(
  body: unknown,
  status: number,
  requestId?: string,
) {
  const result = errorSchema.safeParse(body);
  const headerId = z.uuid().safeParse(requestId);
  const fallback = () =>
    new ApiError(
      "요청을 처리하지 못했습니다.",
      status,
      "HTTP_ERROR",
      headerId.success ? headerId.data : undefined,
    );
  if (!result.success || result.data.statusCode !== status) return fallback();
  const data = result.data;
  const known = messages[data.code];
  if (
    !known ||
    known.status !== status ||
    (data.fieldErrors && data.code !== "VALIDATION_FAILED")
  )
    return fallback();
  // The wire message is checked for shape but never displayed. Only local,
  // code-owned copy and validated field codes reach the UI.
  return new ApiError(
    known.message,
    status,
    data.code,
    data.requestId,
    data.fieldErrors,
  );
}
