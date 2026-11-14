import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  type ArgumentsHost,
} from "@nestjs/common";
import { QueryFailedError } from "typeorm";
import { HttpExceptionFilter } from "../src/common/http/http-exception.filter.js";
import type { RequestWithId } from "../src/common/http/request-context.js";
import { AuthError } from "../src/modules/auth/auth-error.js";

function capture(error: unknown) {
  const request = { requestId: "test-request-id" } as RequestWithId;
  let status = 0;
  let body: Record<string, unknown> = {};
  const response = {
    setHeader() {},
    status(value: number) {
      status = value;
      return this;
    },
    json(value: Record<string, unknown>) {
      body = value;
    },
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as ArgumentsHost;
  new HttpExceptionFilter().catch(error, host);
  return { status, body, failure: request.failure };
}

const driverError = (code: string) =>
  new QueryFailedError(
    "SELECT password FROM private_table WHERE token = $1",
    ["private-sql-parameter"],
    Object.assign(new Error("postgresql://private:password@host/db"), {
      code,
      detail: "private-cookie",
    }),
  );

test("expected HTTP/auth errors, DB outages and unexpected errors remain distinct", () => {
  const cases: [unknown, number, string][] = [
    [new BadRequestException("private-input"), 400, "BAD_REQUEST"],
    [new ForbiddenException(), 403, "FORBIDDEN"],
    [new ConflictException(), 409, "CONFLICT"],
    ...["ACCESS_EXPIRED", "SESSION_INVALID", "INVALID_CREDENTIALS"].map(
      (code) =>
        [new AuthError(code as "ACCESS_EXPIRED"), 401, code] as [
          unknown,
          number,
          string,
        ],
    ),
    [new TypeError("private-code-error"), 500, "INTERNAL_SERVER_ERROR"],
    [new Error("private-unknown"), 500, "INTERNAL_SERVER_ERROR"],
    [driverError("08P01"), 500, "INTERNAL_SERVER_ERROR"],
    [driverError("23505"), 500, "INTERNAL_SERVER_ERROR"],
    [driverError("23503"), 500, "INTERNAL_SERVER_ERROR"],
    [driverError("42P01"), 500, "INTERNAL_SERVER_ERROR"],
    [driverError("28P01"), 500, "INTERNAL_SERVER_ERROR"],
    [driverError("P0001"), 500, "INTERNAL_SERVER_ERROR"],
    [driverError("57P01"), 503, "SERVICE_UNAVAILABLE"],
    [driverError("53300"), 503, "SERVICE_UNAVAILABLE"],
    [driverError("57014"), 503, "SERVICE_UNAVAILABLE"],
    [
      Object.assign(new Error("private-host"), { code: "ECONNREFUSED" }),
      503,
      "SERVICE_UNAVAILABLE",
    ],
    [
      new AggregateError([
        Object.assign(new Error(), { code: "ECONNREFUSED" }),
      ]),
      503,
      "SERVICE_UNAVAILABLE",
    ],
    [
      new Error("Connection terminated unexpectedly"),
      503,
      "SERVICE_UNAVAILABLE",
    ],
    [
      new Error("timeout exceeded when trying to connect"),
      503,
      "SERVICE_UNAVAILABLE",
    ],
  ];
  for (const [error, status, code] of cases) {
    const result = capture(error);
    assert.equal(result.status, status);
    assert.equal(result.body.code, code);
    assert.equal(result.body.requestId, "test-request-id");
    assert.deepEqual(Object.keys(result.body).sort(), [
      "code",
      "message",
      "requestId",
      "statusCode",
    ]);
    assert.doesNotMatch(
      JSON.stringify(result),
      /private-|postgresql|SELECT|password/,
    );
    assert.equal(
      result.failure?.category,
      status === 503
        ? "database_unavailable"
        : status === 500
          ? "unexpected"
          : "http",
    );
  }
});

test("diagnostics keep only allowlisted codes and application stack locations", () => {
  const error = Object.assign(new TypeError("private-message"), {
    name: "private-name",
    code: "TOKEN",
  });
  error.stack =
    "TypeError: private-message\n    at leak (file:///private-home/apps/api/dist/modules/groups/groups.service.js:21:7)\n    at private-function (file:///private-home/node_modules/pg/query.js:3:1)";
  const result = capture(error);
  assert.deepEqual(result.failure, {
    category: "unexpected",
    type: "TypeError",
    locations: ["modules/groups/groups.service.js:21:7"],
  });
  assert.doesNotMatch(JSON.stringify(result), /private|TOKEN|leak/);
});
