import assert from "node:assert/strict";
import { test } from "node:test";
import { domainErrors } from "../apps/api/src/common/http/domain-errors.ts";
import { messages } from "../apps/web/shared/http/error-messages.ts";
import { safeReturnPath as serverReturn } from "../apps/api/src/modules/auth/utils/return-path.ts";
import { registerHooks } from "node:module";
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/"))
      return nextResolve(
        new URL(`../apps/web/${specifier.slice(2)}.ts`, import.meta.url).href,
        context,
      );
    return nextResolve(specifier, context);
  },
});
const { safeReturnPath: browserReturn } =
  await import("../apps/web/features/auth/lib/return-path.ts");
hooks.deregister();

test("web recognizes the HTTP status of every API domain error", () => {
  for (const [code, { status }] of Object.entries(domainErrors)) {
    assert.equal(messages[code]?.status, status, code);
  }
});

test("login return paths preserve the same organizer context on both sides", () => {
  const id = "d4a0081c-790c-42be-b072-6e6012423632";
  for (const path of [
    "/?view=personal",
    `/events?group=${id}&date=2026-12-05`,
    "/events?date=2026-02-30",
    `/?group=${id}`,
    `/?group=${id}&event=${id}`,
    `/?view=personal&event=${id}`,
    `/mypage?view=roster&group=${id}`,
    `/events?event=${id}&view=roster&action=import`,
    "/events?view=records&scope=personal",
    "/events?scope=personal",
    `/events?event=${id}&view=attendance&scope=personal`,
    `/events?event=${id}&view=attendance&round=${id}`,
    `/events?event=${id}&request=${id}`,
    "//example.test",
  ]) {
    assert.equal(serverReturn(path), browserReturn(path), path);
  }
});
