import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError } from "../http/api-error";
import { safeErrorMessage } from "../http/error-contract";

const fieldMessages = {
  INVALID_TYPE: "입력 형식을 확인해 주세요.",
  INVALID_LENGTH: "입력 길이를 확인해 주세요.",
  INVALID_EMAIL: "이메일을 확인해 주세요.",
  INVALID_UUID: "선택한 항목을 확인해 주세요.",
  INVALID_FORMAT: "입력 형식을 확인해 주세요.",
  INVALID_VALUE: "입력 값을 확인해 주세요.",
};

export function applyFormError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: Record<string, Path<T>>,
) {
  let common = true;
  if (
    error instanceof ApiError &&
    error.code === "VALIDATION_FAILED" &&
    error.fieldErrors?.length
  ) {
    common = false;
    for (const item of error.fieldErrors) {
      const field = Object.hasOwn(fields, item.field)
        ? fields[item.field]
        : undefined;
      if (field)
        setError(field, { type: "server", message: fieldMessages[item.code] });
      else common = true;
    }
  }
  if (common)
    setError("root.server", {
      type: "server",
      message: safeErrorMessage(error),
    });
}
