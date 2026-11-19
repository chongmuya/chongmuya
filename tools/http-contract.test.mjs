import assert from "node:assert/strict";
import { test } from "node:test";
import { domainErrors } from "../apps/api/src/common/http/domain-errors.ts";
import { messages } from "../apps/web/shared/http/error-messages.ts";
import { safeReturnPath as serverReturn } from "../apps/api/src/modules/auth/utils/return-path.ts";
import { safeReturnPath as browserReturn } from "../apps/web/features/auth/lib/return-path.ts";

test("web recognizes the HTTP status of every API domain error", () => {
  for (const [code, { status }] of Object.entries(domainErrors)) {
    assert.equal(messages[code]?.status, status, code);
  }
});

test("login return paths preserve the same organizer context on both sides", () => {
  const id = "d4a0081c-790c-42be-b072-6e6012423632";
  for (const path of [
    "/?view=personal",
    `/?group=${id}`,
    `/events?event=${id}&view=attendance&round=${id}`,
    "//example.test",
  ]) {
    assert.equal(serverReturn(path), browserReturn(path), path);
  }
});
