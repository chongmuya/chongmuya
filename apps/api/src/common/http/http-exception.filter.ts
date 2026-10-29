import { ArgumentsHost, Catch, HttpException } from "@nestjs/common";
import type { ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import type { RequestWithId } from "./request-context.js";

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
    const candidate =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const statusCode = candidate >= 400 && candidate <= 599 ? candidate : 500;
    const error = errors[statusCode] ?? {
      code: statusCode >= 500 ? "INTERNAL_SERVER_ERROR" : "HTTP_ERROR",
      message:
        statusCode >= 500
          ? "서버 오류가 발생했습니다."
          : "요청을 처리할 수 없습니다.",
    };
    // Exception messages can contain SQL, credentials or request values.
    response.setHeader("Cache-Control", "no-store");
    response
      .status(statusCode)
      .json({ statusCode, ...error, requestId: request.requestId });
  }
}
