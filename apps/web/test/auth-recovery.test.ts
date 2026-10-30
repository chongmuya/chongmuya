import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthRecovery } from "../features/auth/auth-recovery";

const render = (
  status: "unavailable" | "logout-failed" | "logging-out",
  pending = false,
) =>
  renderToStaticMarkup(
    createElement(AuthRecovery, {
      status,
      pending,
      onRestore() {},
      onLogout() {},
    }),
  );

test("ordinary connection failure offers restore without claiming logout failed", () => {
  const html = render("unavailable");
  assert.match(html, /연결 재확인/);
  assert.doesNotMatch(html, /로그아웃 다시 시도/);
  assert.match(html, /로그인 상태를 복원/);
});
test("failed logout only offers logout retry, never the no-op restore button", () => {
  const html = render("logout-failed");
  assert.match(html, /로그아웃을 완료하지 못했습니다/);
  assert.match(html, /로그아웃 다시 시도/);
  assert.doesNotMatch(html, /연결 재확인/);
  assert.match(render("logout-failed", true), /disabled/);
});
test("logout in progress provides status with no recovery buttons", () => {
  const html = render("logging-out");
  assert.match(html, /로그아웃 처리 중/);
  assert.doesNotMatch(html, /<button/);
});
