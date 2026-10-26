import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { NextFunction, Request, Response } from "express";

export interface RequestWithId extends Request {
  requestId?: string;
}

export interface RequestLog {
  requestId: string;
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}

export function requestContext(log: (entry: RequestLog) => void) {
  return (request: RequestWithId, response: Response, next: NextFunction) => {
    const requestId = randomUUID();
    const started = performance.now();
    request.requestId = requestId;
    response.setHeader("X-Request-Id", requestId);
    response.once("finish", () => {
      const route: unknown = request.route?.path;
      // Do not log raw URLs, query strings, headers, bodies, or user identifiers.
      log({
        requestId,
        method: request.method,
        route: typeof route === "string" ? route : "unmatched",
        statusCode: response.statusCode,
        durationMs: Math.round(performance.now() - started),
      });
    });
    next();
  };
}
