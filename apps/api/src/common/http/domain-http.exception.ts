import { HttpException } from "@nestjs/common";
import type { ValidationError } from "class-validator";

import { domainErrors } from "./domain-errors.js";

export type FieldError = {
  field: string;
  code:
    | "INVALID_TYPE"
    | "INVALID_LENGTH"
    | "INVALID_EMAIL"
    | "INVALID_UUID"
    | "INVALID_FORMAT"
    | "INVALID_VALUE";
};

// Only code-owned messages may cross the HTTP boundary. Never accept a message
// or validator's original constraints/target/value as an exception argument.
export class DomainHttpException extends HttpException {
  constructor(
    readonly code: keyof typeof domainErrors,
    readonly fieldErrors?: FieldError[],
  ) {
    super(domainErrors[code].message, domainErrors[code].status);
  }
  get safeMessage() {
    return domainErrors[this.code].message;
  }
}

const validationCodes: Record<string, FieldError["code"]> = {
  isString: "INVALID_TYPE",
  isLength: "INVALID_LENGTH",
  minLength: "INVALID_LENGTH",
  maxLength: "INVALID_LENGTH",
  isEmail: "INVALID_EMAIL",
  isUuid: "INVALID_UUID",
  isIso8601: "INVALID_FORMAT",
  matches: "INVALID_FORMAT",
  isInt: "INVALID_VALUE",
  min: "INVALID_VALUE",
  max: "INVALID_VALUE",
};

export function validationException(errors: ValidationError[]) {
  const fields: FieldError[] = [];
  function collect(items: ValidationError[], parent = "") {
    for (const error of items) {
      // Unknown input keys are user input too: do not echo them, even as paths.
      if (
        error.constraints?.whitelistValidation ||
        !/^[a-zA-Z][\w]*$/.test(error.property)
      )
        continue;
      const field = parent ? `${parent}.${error.property}` : error.property;
      if (
        field.length > 100 ||
        field
          .split(".")
          .some((part) =>
            ["__proto__", "constructor", "prototype"].includes(part),
          )
      )
        continue;
      const code = Object.keys(error.constraints ?? {})
        .map((key) => validationCodes[key])
        .find(Boolean);
      if (code && fields.length < 50) fields.push({ field, code });
      if (error.children?.length) collect(error.children, field);
    }
  }
  collect(errors);
  return new DomainHttpException(
    "VALIDATION_FAILED",
    fields.length ? fields : undefined,
  );
}
