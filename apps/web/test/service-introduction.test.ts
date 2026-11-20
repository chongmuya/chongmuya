import "./support/dom";
import { createElement } from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { client, render, click } from "./support/form-dom";
import { ServiceIntroduction } from "../features/auth/components/service-introduction";
import { authEntryPath } from "../features/auth/lib/auth-entry-path";

test("optional introduction visits all three slides, returns to the prior slide and preserves the safe return route", async () => {
  const next =
    "/events?event=00000000-0000-4000-8000-000000000001&view=attendance";
  const view = await render(createElement(ServiceIntroduction), client(), next);
  try {
    assert.match(view.container.textContent!, /전화 세 번/);
    assert.equal(
      view.container.querySelector("a")?.getAttribute("href"),
      authEntryPath("/start", next),
    );
    await click(view.container, "다음");
    assert.match(view.container.textContent!, /받은 답을/);
    await click(view.container, "이전");
    assert.match(view.container.textContent!, /전화 세 번/);
    await click(view.container, "다음");
    await click(view.container, "다음");
    assert.match(view.container.textContent!, /참석·정산까지/);
    assert.doesNotMatch(
      view.container.textContent!,
      /자동 입금|자동 환불|그대로 불러/,
    );
    const finish = [...view.container.querySelectorAll("a")].find(
      (a) => a.textContent === "시작하기",
    );
    assert.equal(finish?.getAttribute("href"), authEntryPath("/start", next));
  } finally {
    await view.unmount();
  }
});

test("introduction skip cannot accept external or nested entry destinations", async () => {
  for (const input of [
    "https://outside.test",
    "/intro?next=/start",
    "/start?next=/intro",
    "//outside.test",
  ]) {
    const view = await render(
      createElement(ServiceIntroduction),
      client(),
      input,
    );
    try {
      for (const a of view.container.querySelectorAll("a"))
        assert.equal(a.getAttribute("href"), "/start?next=%2Fevents");
    } finally {
      await view.unmount();
    }
  }
});
