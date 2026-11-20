import "./support/dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { render, fill, submit, until, click } from "./support/form-dom";
import { ScheduleForm } from "../features/calendar/components/schedule-form";
import { monthRange } from "../features/calendar/lib/dates";
import { koreanDateOnly } from "../shared/lib/korean-date";
import { notificationDestination } from "../features/notifications/lib/destination";
import { safeReturnPath } from "../features/auth/lib/return-path";
import { ApiError } from "../shared/http/api-error";
import type { SessionRequest } from "../features/auth/types";
test("calendar leap years, KST boundaries and safe notification destinations", () => {
  assert.equal(koreanDateOnly(new Date("2028-02-28T15:00:00Z")), "2028-02-29");
  assert.equal(monthRange("2028-12").to, "2029-01-01");
  assert.equal(monthRange("2028-02").to, "2028-03-01");
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
    visibility = "hidden";
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
    assert.equal(calls, 0, "initial hidden mount does not fetch");
    const { onlineManager } = await import("@tanstack/react-query");
    await act(async () => {
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
      window.dispatchEvent(new window.Event("online"));
      t.mock.timers.tick(30000);
    });
    assert.equal(calls, 0, "hidden reconnect cannot wake a query");
    await act(async () => {
      visibility = "visible";
      document.dispatchEvent(new window.Event("visibilitychange"));
    });
    await until(() => assert.equal(calls, 1));
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
    await act(async () => {
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
      window.dispatchEvent(new window.Event("online"));
      window.dispatchEvent(new window.Event("focus"));
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

test("delete conflict requires latest review, keeps draft, and uncertain deletion retries original version", async () => {
  const { useState } = await import("react");
  const originalConfirm = window.confirm;
  window.confirm = () => true;
  const writes: number[] = [];
  let done = 0;
  const initial = {
    id: "schedule",
    groupId: null,
    title: "이전 일정",
    date: "2029-03-01",
    startsAt: null,
    memo: "",
    version: 1,
    deletedAt: null,
  };
  const request: SessionRequest = async <T>(
    _path: `/api/v1/${string}`,
    options?: RequestInit,
  ) => {
    writes.push(JSON.parse(String(options?.body)).expectedVersion);
    if (writes.length === 1)
      throw new ApiError("", 409, "WORKSPACE_VERSION_CONFLICT");
    if (writes.length === 2) throw new ApiError("", 0, "NETWORK_ERROR");
    return { ok: true } as T;
  };
  function Probe() {
    const [latest, setLatest] = useState(initial);
    return createElement(ScheduleForm, {
      accountId: "a",
      request,
      date: initial.date,
      initial: latest,
      onDone: () => {
        done++;
      },
      onRefresh: () =>
        setLatest({ ...initial, version: 2, title: "다른 사람이 수정" }),
    });
  }
  const view = await render(createElement(Probe));
  try {
    await fill(view.container, "title", "보존할 초안");
    await click(view.container, "일정 삭제");
    await until(() =>
      assert.match(view.container.textContent ?? "", /다른 사람이 수정/),
    );
    assert.deepEqual(writes, [1]);
    await click(view.container, "최신 일정 확인 후 삭제 다시 시도");
    assert.equal(
      view.container.querySelector<HTMLInputElement>('[name="title"]')?.value,
      "보존할 초안",
    );
    await click(view.container, "일정 삭제");
    await until(() =>
      assert.match(
        view.container.textContent ?? "",
        /같은 삭제 요청으로 결과 재확인/,
      ),
    );
    await click(view.container, "같은 삭제 요청으로 결과 재확인");
    await until(() => assert.equal(done, 1));
    assert.deepEqual(writes, [1, 2, 2]);
  } finally {
    window.confirm = originalConfirm;
    await view.unmount();
  }
});
test("definitive schedule validation failure permits correction without an uncertain-success warning", async () => {
  const request: SessionRequest = async () => {
    throw new ApiError("", 400, "VALIDATION_FAILED");
  };
  const view = await render(
    createElement(ScheduleForm, {
      accountId: "a",
      request,
      date: "2029-03-01",
      onDone: () => {},
      onRefresh: () => {},
    }),
  );
  try {
    await fill(view.container, "title", "합성 일정");
    await submit(view.container);
    await until(() =>
      assert.match(view.container.textContent ?? "", /입력값을 확인해 수정/),
    );
    assert(!view.container.querySelector("fieldset")?.disabled);
    assert.doesNotMatch(
      view.container.textContent ?? "",
      /같은 요청으로 결과 재확인/,
    );
  } finally {
    await view.unmount();
  }
});

test("one authenticated unread observer survives screens, badges do not poll, and logout stops it", async (t) => {
  const { act } = await import("react");
  const { AuthProvider, useAuth } =
    await import("../features/auth/components/auth-provider");
  const { NotificationObserver, NotificationBadge } =
    await import("../features/notifications/components/inbox");
  const oldFetch = globalThis.fetch,
    descriptor = Object.getOwnPropertyDescriptor(document, "visibilityState");
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  let calls = 0;
  let authenticated = true;
  globalThis.fetch = async (input) => {
    if (String(input).endsWith("restore"))
      return Response.json({
        authenticated,
        account: authenticated
          ? {
              id: "a",
              email: "synthetic@example.test",
              accountType: "organizer",
            }
          : null,
      });
    if (String(input).endsWith("logout")) {
      authenticated = false;
      return new Response(null, { status: 204 });
    }
    if (String(input).endsWith("unread")) {
      calls++;
      return Response.json({
        unread: calls,
        through: "1",
        items: [],
        next: null,
      });
    }
    throw Error("unexpected request");
  };
  t.mock.timers.enable({ apis: ["setInterval"] });
  function Screen() {
    const { account, client } = useAuth();
    return account
      ? createElement(
          "div",
          null,
          createElement(NotificationBadge, {
            accountId: account.id,
            request: client.request.bind(client),
          }),
          createElement(NotificationBadge, {
            accountId: account.id,
            request: client.request.bind(client),
          }),
          createElement(
            "button",
            { onClick: () => void client.logout() },
            "로그아웃",
          ),
        )
      : null;
  }
  const view = await render(
    createElement(
      AuthProvider,
      null,
      createElement(NotificationObserver),
      createElement(Screen),
    ),
  );
  try {
    await until(() => assert.equal(calls, 1));
    await act(async () => t.mock.timers.tick(30000));
    await until(() => assert.equal(calls, 2));
    await click(view.container, "로그아웃");
    await until(() =>
      assert.equal(
        view.container.querySelectorAll('a[href="/notifications"]').length,
        0,
      ),
    );
    const end = calls;
    await act(async () => {
      t.mock.timers.tick(90000);
      window.dispatchEvent(new window.Event("online"));
    });
    assert.equal(calls, end);
    assert.equal(
      view.cache.getQueryCache().findAll({ queryKey: ["user", "a"] }).length,
      0,
    );
  } finally {
    await view.unmount();
    t.mock.timers.reset();
    globalThis.fetch = oldFetch;
    if (descriptor)
      Object.defineProperty(document, "visibilityState", descriptor);
    else Reflect.deleteProperty(document, "visibilityState");
  }
});

test("organizer with no nickname can save only a name without sending an invalid empty nickname", async () => {
  const { AuthProvider } =
    await import("../features/auth/components/auth-provider");
  const { AccountSettings } =
    await import("../features/account/components/account-settings");
  const oldFetch = globalThis.fetch;
  let input: unknown;
  const account = {
    id: "a",
    email: "synthetic@example.test",
    accountType: "organizer",
    name: "이전 이름",
    nickname: null,
    phone: null,
    phoneVerifiedAt: null,
    emailVerifiedAt: null,
  };
  globalThis.fetch = async (path, options) => {
    if (String(path).endsWith("restore"))
      return Response.json({ authenticated: true, account });
    if (String(path).endsWith("terms")) return Response.json({ terms: [] });
    if (String(path).endsWith("profile")) {
      input = JSON.parse(String(options?.body));
      return Response.json({ ...account, name: "새 이름" });
    }
    throw Error("unexpected request");
  };
  const view = await render(
    createElement(AuthProvider, null, createElement(AccountSettings)),
  );
  try {
    await until(() => assert(view.container.querySelector('[name="name"]')));
    await fill(view.container, "name", "새 이름");
    await submit(view.container);
    await until(() => assert.deepEqual(input, { name: "새 이름" }));
  } finally {
    await view.unmount();
    globalThis.fetch = oldFetch;
  }
});
