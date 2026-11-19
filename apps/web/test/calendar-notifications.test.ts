import "./support/dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { render, fill, submit, until, click } from "./support/form-dom";
import { ScheduleForm } from "../features/calendar/components/schedule-form";
import {
  monthRange,
  monthDays,
  kstDate,
  moveMonth,
} from "../features/calendar/lib/dates";
import { notificationDestination } from "../features/notifications/lib/destination";
import { safeReturnPath } from "../features/auth/lib/return-path";
import { ApiError } from "../shared/http/api-error";
import type { SessionRequest } from "../features/auth/types";
test("calendar leap years, KST boundaries and safe notification destinations", () => {
  assert.equal(kstDate(new Date("2028-02-28T15:00:00Z")), "2028-02-29");
  assert.equal(moveMonth("2028-12", 1), "2029-01");
  assert.equal(monthRange("2028-02").to, "2028-03-01");
  assert(monthDays("2028-02").includes("2028-02-29"));
  assert.equal(monthDays("2028-02").length % 7, 0);
  const id = "00000000-0000-4000-8000-000000000001";
  for (const bad of [
    "https://evil.test",
    "//evil.test",
    "/events?event=bad",
    "/api/v1/auth/logout",
    "/events?event=" + id + "&next=https://evil.test",
  ])
    assert.equal(notificationDestination(bad), null);
  for (const path of [
    `/events?event=${id}&view=settlement`,
    `/owner/reservations?reservation=${id}`,
    `/calendar?schedule=${id}`,
  ]) {
    assert.equal(notificationDestination(path), path);
    assert.equal(safeReturnPath(path), path);
  }
});
test("schedule response loss retains original input/version/key, then allows a distinct operation", async () => {
  const writes: unknown[] = [];
  let done = 0;
  const request: SessionRequest = async <T>(
    _path: `/api/v1/${string}`,
    options?: RequestInit,
  ) => {
    const body = JSON.parse(String(options?.body));
    writes.push(body);
    if (writes.length === 1) throw new ApiError("", 0, "NETWORK_ERROR");
    return { id: "schedule", version: 1 } as T;
  };
  const view = await render(
    createElement(ScheduleForm, {
      accountId: "a",
      request,
      date: "2029-03-01",
      onDone: () => {
        done++;
      },
      onRefresh: () => {},
    }),
  );
  try {
    await fill(view.container, "title", "합성 일정");
    await submit(view.container);
    await until(() =>
      assert.match(
        view.container.textContent ?? "",
        /같은 요청으로 결과 재확인/,
      ),
    );
    assert(view.container.querySelector("fieldset")?.disabled);
    await submit(view.container);
    await until(() => assert.equal(done, 1));
    assert.deepEqual(writes[1], writes[0]);
    await fill(view.container, "title", "별개 일정");
    await submit(view.container);
    await until(() => assert.equal(done, 2));
    assert.notEqual(
      (writes[2] as { requestKey: string }).requestKey,
      (writes[0] as { requestKey: string }).requestKey,
    );
  } finally {
    await view.unmount();
  }
});
test("schedule confirmed version conflict preserves draft until explicit latest review/reapply", async () => {
  let count = 0;
  const initial = {
    id: "schedule",
    groupId: null,
    title: "원래 일정",
    date: "2029-03-01",
    startsAt: null,
    memo: "",
    version: 1,
    deletedAt: null,
  };
  const request: SessionRequest = async () => {
    count++;
    throw new ApiError("", 409, "WORKSPACE_VERSION_CONFLICT");
  };
  const view = await render(
    createElement(ScheduleForm, {
      accountId: "a",
      request,
      date: initial.date,
      initial,
      onDone: () => {},
      onRefresh: () => {},
    }),
  );
  try {
    await fill(view.container, "title", "내 초안");
    await submit(view.container);
    await until(() =>
      assert.match(view.container.textContent ?? "", /일정이 변경됐어요/),
    );
    assert.equal(
      (view.container.querySelector('input[name="title"]') as HTMLInputElement)
        .value,
      "내 초안",
    );
    await submit(view.container);
    assert.equal(count, 1);
    await click(view.container, "최신 내용 위에 내 입력 명시적으로 재적용");
    assert.equal(
      (view.container.querySelector('input[name="title"]') as HTMLInputElement)
        .value,
      "내 초안",
    );
  } finally {
    await view.unmount();
  }
});
test("active inbox polls every 30 seconds, hidden tabs stop, visibility return refreshes and unmount stops", async (t) => {
  const { act } = await import("react");
  const { useInbox } =
    await import("../features/notifications/hooks/use-inbox");
  let calls = 0,
    visibility = "visible";
  const descriptor = Object.getOwnPropertyDescriptor(
    document,
    "visibilityState",
  );
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
  t.mock.timers.enable({ apis: ["setInterval"] });
  const request: SessionRequest = async <T>() => {
    calls++;
    return { items: [], unread: calls, through: "0", next: null } as T;
  };
  function Probe() {
    const q = useInbox("account-a", request);
    return createElement("span", null, q.data?.unread);
  }
  const view = await render(createElement(Probe));
  try {
    await until(() => assert(calls > 0));
    const before = calls;
    await act(async () => {
      t.mock.timers.tick(30000);
    });
    await until(() => assert(calls > before));
    await act(async () => {
      visibility = "hidden";
      document.dispatchEvent(new window.Event("visibilitychange"));
    });
    const hidden = calls;
    await act(async () => {
      t.mock.timers.tick(90000);
    });
    assert.equal(calls, hidden);
    await act(async () => {
      visibility = "visible";
      document.dispatchEvent(new window.Event("visibilitychange"));
    });
    await until(() => assert(calls > hidden));
  } finally {
    await view.unmount();
    const end = calls;
    await act(async () => {
      t.mock.timers.tick(60000);
    });
    assert.equal(calls, end);
    t.mock.timers.reset();
    if (descriptor)
      Object.defineProperty(document, "visibilityState", descriptor);
    else Reflect.deleteProperty(document, "visibilityState");
  }
});
