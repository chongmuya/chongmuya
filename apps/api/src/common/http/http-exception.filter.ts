import { ArgumentsHost, Catch, HttpException } from "@nestjs/common";
import type { ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import type { RequestWithId } from "./request-context.js";
import { QueryFailedError } from "typeorm";
import { DomainHttpException } from "./domain-http.exception.js";
import {
  databaseErrorCode,
  isDatabaseUnavailable,
} from "../../database/database-error.js";

const errors: Record<number, { code: string; message: string }> = {
  400: { code: "BAD_REQUEST", message: "요청 형식이 올바르지 않습니다." },
  401: { code: "UNAUTHORIZED", message: "인증이 필요합니다." },
  403: { code: "FORBIDDEN", message: "접근 권한이 없습니다." },
  404: { code: "NOT_FOUND", message: "요청한 리소스를 찾을 수 없습니다." },
  409: { code: "CONFLICT", message: "요청을 현재 상태에 적용할 수 없습니다." },
  413: { code: "PAYLOAD_TOO_LARGE", message: "요청 크기가 너무 큽니다." },
  429: { code: "TOO_MANY_REQUESTS", message: "요청이 너무 많습니다." },
  503: {
    code: "SERVICE_UNAVAILABLE",
    message: "서비스가 준비되지 않았습니다.",
  },
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();
    const unavailable =
      !(exception instanceof HttpException) && isDatabaseUnavailable(exception);
    const payloadTooLarge =
      exception instanceof Error &&
      exception.name === "PayloadTooLargeError" &&
      "type" in exception &&
      exception.type === "entity.too.large" &&
      "status" in exception &&
      exception.status === 413;
    const candidate =
      exception instanceof HttpException
        ? exception.getStatus()
        : payloadTooLarge
          ? 413
          : unavailable
            ? 503
            : 500;
    const statusCode = candidate >= 400 && candidate <= 599 ? candidate : 500;
    const error = errors[statusCode] ?? {
      code: statusCode >= 500 ? "INTERNAL_SERVER_ERROR" : "HTTP_ERROR",
      message:
        statusCode >= 500
          ? "서버 오류가 발생했습니다."
          : "요청을 처리할 수 없습니다.",
    };
    const detail =
      exception instanceof HttpException ? exception.getResponse() : null;
    const authCode =
      statusCode === 401 &&
      typeof detail === "object" &&
      detail !== null &&
      "code" in detail &&
      ["ACCESS_EXPIRED", "SESSION_INVALID", "INVALID_CREDENTIALS"].includes(
        String(detail.code),
      )
        ? String(detail.code)
        : undefined;
    // Keep causes traceable through the request log, without serializing errors.
    // Only code-owned filenames/line numbers survive; messages, function names,
    // arbitrary error.name, SQL, parameters and absolute paths never do.
    request.failure = {
      category: unavailable
        ? "database_unavailable"
        : exception instanceof HttpException || payloadTooLarge
          ? "http"
          : "unexpected",
      type:
        exception instanceof QueryFailedError
          ? "QueryFailedError"
          : exception instanceof HttpException
            ? "HttpException"
            : exception instanceof TypeError
              ? "TypeError"
              : exception instanceof ReferenceError
                ? "ReferenceError"
                : exception instanceof Error
                  ? "Error"
                  : "Unknown",
      ...(databaseErrorCode(exception)
        ? { databaseCode: databaseErrorCode(exception) }
        : {}),
      locations:
        exception instanceof Error
          ? (exception.stack ?? "")
              .split("\n")
              .slice(1)
              .flatMap((line) => {
                const match =
                  /^\s+at .*\/(?:dist|src)\/((?:modules|database|common|bootstrap)\/[\w/.-]+\.[jt]s:\d+:\d+)\)?$/.exec(
                    line,
                  );
                return match ? [match[1]] : [];
              })
              .slice(0, 5)
          : [],
    };
    // Exception messages can contain SQL, credentials or request values.
    response.setHeader("Cache-Control", "no-store");
    response.status(statusCode).json({
      statusCode,
      ...error,
      ...(exception instanceof DomainHttpException
        ? {
            code: exception.code,
            message: exception.safeMessage,
            ...(exception.fieldErrors
              ? { fieldErrors: exception.fieldErrors }
              : {}),
          }
        : {}),
      ...(authCode ? { code: authCode } : {}),
      requestId: request.requestId,
    });
  }
}
