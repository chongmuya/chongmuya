import "./support/dom";
import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  SearchParamsContext,
  PathnameContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { WorkspaceContent } from "../app/workspace-screen";
import { LinkEventGroupForm } from "../features/events/components/link-event-group-form";
import { EventForm } from "../features/events/components/event-form";
import { GroupForm } from "../features/groups/components/group-form";
import { AuthProvider } from "../features/auth/components/auth-provider";
import { AuthEntryScreen } from "../features/auth/components/auth-entry-screen";
import { AuthScreen } from "../features/auth/components/auth-screen";
import type { SessionRequest } from "../features/auth/types";
import { ApiError } from "../shared/http/api-error";

function client() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
}
async function render(
  element: ReactElement,
  cache = client(),
  next = "",
  mode = "",
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const navigations: string[] = [];
  const router = {
    bfcacheId: "test",
    back() {},
    forward() {},
    refresh() {},
    push(url: string) {
      navigations.push(url);
    },
    replace(url: string) {
      navigations.push(url);
    },
    prefetch: async () => {},
    hmrRefresh() {},
  };
  await act(async () =>
    root.render(
      createElement(
        AppRouterContext.Provider,
        { value: router },
        createElement(
          PathnameContext.Provider,
          { value: "/auth" },
          createElement(
            SearchParamsContext.Provider,
            { value: new URLSearchParams({ next, mode }) },
            createElement(QueryClientProvider, { client: cache }, element),
          ),
        ),
      ),
    ),
  );
  return {
    container,
    cache,
    navigations,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
      cache.clear();
    },
  };
}
async function until(check: () => void) {
  for (let attempt = 0; ; attempt++) {
    try {
      check();
      return;
    } catch (error) {
      if (attempt === 100) throw error;
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}
async function fill(container: HTMLElement, name: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(
    `input[name="${name}"]`,
  );
  assert(input);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}
async function submit(container: HTMLElement) {
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(
        new window.Event("submit", { bubbles: true, cancelable: true }),
      );
  });
}
async function click(container: HTMLElement, text: string) {
  const button = [...container.querySelectorAll("button")].find(
    (item) => item.textContent === text,
  );
  assert(button, text);
  await act(async () => button.click());
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("optional group management validates and creates a group without forcing event onboarding", async () => {
  const cache = client();
  cache.setQueryData(["user", "a", "groups"], []);
  const created = { id: "g-new", name: "첫 모임" };
  const writes: unknown[] = [];
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    if (options?.method === "POST") {
      writes.push(JSON.parse(String(options.body)));
      return created as T;
    }
    return (writes.length ? [created] : []) as T;
  };
  const view = await render(
    createElement(WorkspaceContent, {
      accountId: "a",
      request,
      groupId: null,
      eventId: null,
      mode: "mypage",
    }),
    cache,
  );
  try {
    await fill(view.container, "name", "   ");
    await submit(view.container);
    assert.match(view.container.textContent!, /이름을 입력/);
    assert.equal(writes.length, 0);
    await fill(view.container, "name", " 첫 모임 ");
    await submit(view.container);
    await until(() =>
      assert.deepEqual(view.navigations, ["/mypage?group=g-new"]),
    );
    assert.deepEqual(writes, [{ name: "첫 모임" }]);
    assert.deepEqual(cache.getQueryData(["user", "a", "groups"]), [created]);
  } finally {
    await view.unmount();
  }
});

test("failed group save retains input and retries only on another submit", async () => {
  let count = 0;
  const request: SessionRequest = async <T>() => {
    count++;
    if (count === 1) throw new ApiError("offline", 503, "NETWORK_ERROR");
    return { id: "g1", name: "새 이름" } as T;
  };
  const cache = client();
  cache.setQueryData(
    ["user", "a", "groups"],
    [{ id: "g1", name: "이전 이름" }],
  );
  cache.setQueryData(
    ["user", "b", "groups"],
    [{ id: "other", name: "다른 계정" }],
  );
  const view = await render(
    createElement(GroupForm, {
      accountId: "a",
      request,
      group: { id: "g1", name: "이전 이름" },
      title: "모임 이름 수정",
    }),
    cache,
  );
  try {
    await fill(view.container, "name", "새 이름");
    await submit(view.container);
    await until(() =>
      assert.match(view.container.textContent!, /저장하지 못했습니다/),
    );
    assert.equal(count, 1);
    assert.equal(view.container.querySelector("input")!.value, "새 이름");
    await submit(view.container);
    await until(() =>
      assert.match(view.container.textContent!, /저장했습니다/),
    );
    assert.equal(count, 2);
    assert.deepEqual(cache.getQueryData(["user", "a", "groups"]), [
      { id: "g1", name: "새 이름" },
    ]);
    assert.deepEqual(cache.getQueryData(["user", "b", "groups"]), [
      { id: "other", name: "다른 계정" },
    ]);
  } finally {
    await view.unmount();
  }
});

test("event form submits Korean time and refreshes the account list plus only its group list", async () => {
  let body: unknown;
  const groups = deferred<{ id: string; name: string }[]>();
  const event = {
    id: "e1",
    ownerId: "a",
    version: 1,
    groupId: "00000000-0000-4000-8000-000000000001",
    name: "새 행사",
    scheduledAt: "2026-11-14T09:30:00.000Z",
  };
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    if (!options?.method) return (await groups.promise) as T;
    body = JSON.parse(String(options?.body));
    return event as T;
  };
  const cache = client();
  cache.setQueryData(["user", "a", "events", "list"], []);
  cache.setQueryData(
    ["user", "a", "groups", "00000000-0000-4000-8000-000000000001", "events"],
    [],
  );
  cache.setQueryData(["user", "a", "groups", "g2", "events"], []);
  const view = await render(
    createElement(EventForm, {
      accountId: "a",
      groupId: "00000000-0000-4000-8000-000000000001",
      request,
    }),
    cache,
  );
  try {
    const select = view.container.querySelector("select")!;
    assert.match(select.selectedOptions[0].textContent!, /모임 확인/);
    assert.notEqual(select.value, event.groupId);
    await fill(view.container, "name", " 새 행사 ");
    await fill(view.container, "date", "2026-11-14T18:30");
    await submit(view.container);
    assert.equal(body, undefined);
    await act(async () => {
      groups.resolve([{ id: event.groupId, name: "내 모임" }]);
    });
    await until(() => assert.equal(select.value, event.groupId));
    assert.equal(select.selectedOptions[0].textContent, "내 모임");
    await submit(view.container);
    await until(() => assert.deepEqual(view.navigations, ["/events?event=e1"]));
    assert.deepEqual(body, {
      name: "새 행사",
      scheduledAt: event.scheduledAt,
      groupId: event.groupId,
    });
    assert.deepEqual(
      cache.getQueryData(["user", "a", "events", "detail", "e1"]),
      event,
    );
    assert.equal(
      cache.getQueryState([
        "user",
        "a",
        "groups",
        "00000000-0000-4000-8000-000000000001",
        "events",
      ])?.isInvalidated,
      true,
    );
    assert.equal(
      cache.getQueryState(["user", "a", "groups", "g2", "events"])
        ?.isInvalidated,
      false,
    );
  } finally {
    await view.unmount();
  }
});

test("late group and event mutations after leaving the screen never recreate cache or navigate", async () => {
  for (const kind of ["group", "event"] as const) {
    const pending = deferred<{
      id: string;
      groupId: string;
      name: string;
      scheduledAt: null;
    }>();
    let called = false;
    const request: SessionRequest = async <T>(
      _path: string,
      options?: RequestInit,
    ) => {
      if (!options?.method) return [] as T;
      called = true;
      return (await pending.promise) as T;
    };
    let created = false;
    const element =
      kind === "group"
        ? createElement(GroupForm, {
            accountId: "a",
            request,
            title: "모임 추가",
            onCreated: () => {
              created = true;
            },
          })
        : createElement(EventForm, { accountId: "a", request });
    const view = await render(element);
    await fill(view.container, "name", "지연 저장");
    await submit(view.container);
    await until(() => assert(called));
    await view.unmount();
    await act(async () => {
      pending.resolve({
        id: "saved",
        groupId: "g1",
        name: "지연 저장",
        scheduledAt: null,
      });
      await pending.promise;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(view.cache.getQueryCache().getAll().length, 0);
    assert.equal(created, false);
    assert.deepEqual(view.navigations, []);
  }
});

test("auth form preserves login and failed-logout recovery without caching credentials", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  let logoutCalls = 0;
  let authenticated = false;
  globalThis.fetch = async (input, options) => {
    const path = String(input);
    calls.push(path);
    if (path.endsWith("restore"))
      return Response.json({
        authenticated,
        account: authenticated ? { id: "a", email: "user@example.com" } : null,
      });
    if (path.endsWith("login")) {
      assert.deepEqual(JSON.parse(String(options?.body)), {
        email: "user@example.com",
        password: "test-password-123",
      });
      authenticated = true;
      return Response.json({
        authenticated: true,
        account: { id: "a", email: "user@example.com" },
      });
    }
    if (path.endsWith("logout")) {
      logoutCalls++;
      if (logoutCalls > 1) authenticated = false;
      return logoutCalls === 1
        ? Response.json({ code: "UNAVAILABLE" }, { status: 503 })
        : new Response(null, { status: 204 });
    }
    return Response.json({ id: "a", email: "user@example.com" });
  };
  const view = await render(
    createElement(AuthProvider, null, createElement(AuthScreen)),
    client(),
    "/events?event=00000000-0000-4000-8000-000000000001",
  );
  try {
    await until(() => assert(view.container.querySelector("form")));
    await submit(view.container);
    assert.match(view.container.textContent!, /이메일을 확인/);
    await fill(view.container, "email", "USER@example.com");
    await fill(view.container, "password", "test-password-123");
    await submit(view.container);
    await until(() =>
      assert.match(view.container.textContent!, /계정으로 로그인했습니다/),
    );
    assert(
      !JSON.stringify(
        view.cache
          .getMutationCache()
          .getAll()
          .map((m) => m.state),
      ).includes("test-password-123"),
    );
    assert(
      view.navigations.includes(
        "/events?event=00000000-0000-4000-8000-000000000001",
      ),
    );
    await click(view.container, "로그아웃");
    await until(() =>
      assert.match(view.container.textContent!, /로그아웃 다시 시도/),
    );
    assert.doesNotMatch(view.container.textContent!, /연결 재확인/);
    assert(
      view.cache
        .getQueryCache()
        .findAll({ queryKey: ["user"] })
        .every((query) => query.state.data === undefined),
    );
    await click(view.container, "로그아웃 다시 시도");
    await until(() => assert(view.container.querySelector("form")));
    assert.equal(logoutCalls, 2);
  } finally {
    await view.unmount();
    globalThis.fetch = original;
  }
});

async function selectGroup(container: HTMLElement, value: string) {
  const select = container.querySelector<HTMLSelectElement>(
    'select[name="groupId"]',
  );
  assert(select);
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
}

test("an unavailable URL group blocks submission and refetch preserves an explicit personal choice", async () => {
  const groupId = "00000000-0000-4000-8000-000000000001";
  let failed = true;
  const writes: unknown[] = [];
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    if (!options?.method) {
      if (failed) throw new ApiError("offline", 503, "SERVICE_UNAVAILABLE");
      return [{ id: groupId, name: "내 모임" }] as T;
    }
    writes.push(JSON.parse(String(options.body)));
    return { id: "e1", groupId: null } as T;
  };
  const view = await render(
    createElement(EventForm, { accountId: "a", groupId, request }),
  );
  try {
    await until(() =>
      assert.match(view.container.textContent!, /모임을 불러오지 못했습니다/),
    );
    const select = view.container.querySelector("select")!;
    assert.match(select.selectedOptions[0].textContent!, /다시 선택/);
    await fill(view.container, "name", "개인 행사");
    await submit(view.container);
    assert.deepEqual(writes, []);
    await selectGroup(view.container, "");
    failed = false;
    await act(async () => {
      await view.cache.refetchQueries({ queryKey: ["user", "a", "groups"] });
    });
    await until(() => assert.equal(select.options.length, 2));
    assert.equal(select.value, "");
    assert.equal(select.selectedOptions[0].textContent, "모임 없이 개인 행사");
    await submit(view.container);
    await until(() => assert.deepEqual(writes, [{ name: "개인 행사" }]));
  } finally {
    await view.unmount();
  }
});

test("refetch failure or missing options blocks a chosen group without replacing it", async () => {
  const groups = [
    { id: "00000000-0000-4000-8000-000000000001", name: "모임 A" },
    { id: "00000000-0000-4000-8000-000000000002", name: "모임 B" },
  ];
  let result = groups;
  let failed = false;
  const writes: unknown[] = [];
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    if (!options?.method) {
      if (failed) throw new ApiError("offline", 503, "SERVICE_UNAVAILABLE");
      return result as T;
    }
    writes.push(JSON.parse(String(options.body)));
    return { id: "e1", groupId: groups[1].id } as T;
  };
  const view = await render(
    createElement(EventForm, {
      accountId: "a",
      groupId: groups[0].id,
      request,
    }),
  );
  try {
    const select = view.container.querySelector("select")!;
    await until(() => assert.equal(select.value, groups[0].id));
    await fill(view.container, "name", "모임 행사");
    await selectGroup(view.container, groups[1].id);
    for (const failure of [true, false]) {
      failed = failure;
      result = [];
      await act(async () => {
        await view.cache.refetchQueries({ queryKey: ["user", "a", "groups"] });
      });
      await until(() =>
        assert.match(select.selectedOptions[0].textContent!, /다시 선택/),
      );
      assert.equal(select.value, groups[1].id);
      await submit(view.container);
      assert.deepEqual(writes, []);
    }
    result = groups;
    await act(async () => {
      await view.cache.refetchQueries({ queryKey: ["user", "a", "groups"] });
    });
    await until(() =>
      assert.equal(select.selectedOptions[0].textContent, "모임 B"),
    );
    assert.equal(select.value, groups[1].id);
    await submit(view.container);
    await until(() =>
      assert.deepEqual(writes, [{ name: "모임 행사", groupId: groups[1].id }]),
    );
  } finally {
    await view.unmount();
  }
});

test("personal event creation works while groups fail and server field errors retain input for retry", async () => {
  let calls = 0;
  const event = {
    id: "e-new",
    ownerId: "a",
    groupId: null,
    version: 1,
    name: "개인 일정",
    scheduledAt: null,
  };
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    if (!options?.method)
      throw new ApiError("unavailable", 503, "SERVICE_UNAVAILABLE");
    calls++;
    assert.deepEqual(JSON.parse(String(options.body)), { name: "개인 일정" });
    if (calls === 1)
      throw new ApiError("private", 400, "VALIDATION_FAILED", undefined, [
        { field: "name", code: "INVALID_LENGTH" },
      ]);
    return event as T;
  };
  const view = await render(
    createElement(EventForm, { accountId: "a", request }),
  );
  try {
    await until(() =>
      assert.match(view.container.textContent!, /모임을 불러오지 못했습니다/),
    );
    await fill(view.container, "name", "개인 일정");
    await submit(view.container);
    await until(() =>
      assert.equal(
        view.container
          .querySelector('input[name="name"]')
          ?.getAttribute("aria-invalid"),
        "true",
      ),
    );
    assert.equal(
      view.container.querySelector<HTMLInputElement>('input[name="name"]')!
        .value,
      "개인 일정",
    );
    assert.doesNotMatch(view.container.textContent!, /private/);
    await submit(view.container);
    await until(() =>
      assert.deepEqual(view.navigations, ["/events?event=e-new"]),
    );
    assert.equal(calls, 2);
  } finally {
    await view.unmount();
  }
});

test("linking shows safe field/business errors, preserves selection and refreshes only affected caches", async () => {
  const groupId = "00000000-0000-4000-8000-000000000001";
  const event = {
    id: "e1",
    ownerId: "a",
    groupId: null,
    version: 1,
    name: "개인 일정",
    scheduledAt: null,
  };
  const linked = { ...event, groupId, version: 2 };
  let saves = 0,
    refreshes = 0;
  const request: SessionRequest = async <T>(
    path: string,
    options?: RequestInit,
  ) => {
    if (!options?.method) return [{ id: groupId, name: "내 모임" }] as T;
    assert.equal(path, "/api/v1/events/e1/group");
    assert.equal(options.method, "PUT");
    assert.deepEqual(JSON.parse(String(options.body)), {
      groupId,
      expectedVersion: 1,
    });
    saves++;
    if (saves === 1)
      throw new ApiError("private", 400, "VALIDATION_FAILED", undefined, [
        { field: "groupId", code: "INVALID_UUID" },
      ]);
    if (saves === 2) throw new ApiError("private", 409, "VERSION_CONFLICT");
    return linked as T;
  };
  const cache = client();
  cache.setQueryData(["user", "a", "events", "list"], [event]);
  cache.setQueryData(["user", "a", "groups", groupId, "events"], []);
  cache.setQueryData(["user", "a", "groups", "other", "events"], []);
  cache.setQueryData(["user", "b", "events", "list"], []);
  const view = await render(
    createElement(LinkEventGroupForm, {
      accountId: "a",
      event,
      request,
      refresh: () => refreshes++,
    }),
    cache,
  );
  try {
    await until(() => assert(view.container.querySelector("select")));
    await selectGroup(view.container, groupId);
    await submit(view.container);
    await until(() =>
      assert.match(view.container.textContent!, /선택한 항목을 확인/),
    );
    assert.equal(view.container.querySelector("select")!.value, groupId);
    await submit(view.container);
    await until(() =>
      assert.match(view.container.textContent!, /행사가 변경되었습니다/),
    );
    await click(view.container, "최신 행사 확인");
    assert.equal(refreshes, 1);
    assert.doesNotMatch(view.container.textContent!, /private/);
    await submit(view.container);
    await until(() =>
      assert.deepEqual(
        cache.getQueryData(["user", "a", "events", "detail", "e1"]),
        linked,
      ),
    );
    assert.deepEqual(cache.getQueryData(["user", "a", "events", "list"]), [
      linked,
    ]);
    for (const key of [
      ["user", "a", "events", "list"],
      ["user", "a", "groups", groupId, "events"],
    ])
      assert.equal(cache.getQueryState(key)?.isInvalidated, true);
    assert.equal(
      cache.getQueryState(["user", "a", "groups", "other", "events"])
        ?.isInvalidated,
      false,
    );
    assert.equal(
      cache.getQueryState(["user", "b", "events", "list"])?.isInvalidated,
      false,
    );
  } finally {
    await view.unmount();
  }
});

test("a pending link cannot recreate a cleared user cache after leaving the screen", async () => {
  const groupId = "00000000-0000-4000-8000-000000000001";
  const event = {
    id: "e1",
    ownerId: "a",
    groupId: null,
    version: 1,
    name: "행사",
    scheduledAt: null,
  };
  const pending = deferred<
    Omit<typeof event, "groupId"> & { groupId: string }
  >();
  let saving = false;
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    if (!options?.method) return [{ id: groupId, name: "내 모임" }] as T;
    saving = true;
    return (await pending.promise) as T;
  };
  const view = await render(
    createElement(LinkEventGroupForm, {
      accountId: "a",
      event,
      request,
      refresh() {},
    }),
  );
  await until(() => assert(view.container.querySelector("select")));
  await selectGroup(view.container, groupId);
  await submit(view.container);
  await until(() => assert(saving));
  await view.unmount();
  await act(async () => {
    pending.resolve({ ...event, groupId, version: 2 });
    await pending.promise;
  });
  assert.equal(view.cache.getQueryCache().getAll().length, 0);
  assert.deepEqual(view.navigations, []);
});

test("start links preserve safe destinations and only the allowed signup mode opens registration", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ authenticated: false, account: null });
  const destination = "/events?event=00000000-0000-4000-8000-000000000001";
  try {
    for (const next of [destination, "https://evil.example"]) {
      const view = await render(
        createElement(
          AuthProvider,
          null,
          createElement(AuthEntryScreen, { screen: "start" }),
        ),
        client(),
        next,
      );
      try {
        await until(() => assert(view.container.querySelector('a[href="/"]')));
        const links = [...view.container.querySelectorAll("a")];
        const signup = new URL(
          links.find((a) => a.textContent === "처음 가입해요")!.href,
        );
        const login = new URL(
          links.find((a) => a.textContent === "이미 계정이 있어요")!.href,
        );
        assert.equal(signup.pathname, "/auth");
        assert.equal(signup.searchParams.get("mode"), "signup");
        assert.equal(login.searchParams.get("mode"), null);
        assert.equal(
          signup.searchParams.get("next"),
          next === destination ? destination : "/events",
        );
        assert.equal(
          login.searchParams.get("next"),
          signup.searchParams.get("next"),
        );
      } finally {
        await view.unmount();
      }
    }
    for (const mode of ["signup", "unexpected"]) {
      const view = await render(
        createElement(
          AuthProvider,
          null,
          createElement(AuthEntryScreen, { screen: "login" }),
        ),
        client(),
        destination,
        mode,
      );
      try {
        await until(() => assert(view.container.querySelector("form")));
        assert.equal(
          view.container.querySelector("form")!.getAttribute("aria-label"),
          mode === "signup" ? "회원가입" : "로그인",
        );
        const back = new URL(
          view.container
            .querySelector('a[href^="/start"]')!
            .getAttribute("href")!,
          "http://localhost",
        );
        assert.equal(back.searchParams.get("next"), destination);
      } finally {
        await view.unmount();
      }
    }
  } finally {
    globalThis.fetch = original;
  }
});

test("branded login distinguishes credentials and connection errors, retries, blocks duplicate submits and returns safely", async () => {
  const original = globalThis.fetch;
  let attempts = 0;
  const pending = deferred<Response>();
  globalThis.fetch = async (input) => {
    if (String(input).endsWith("restore"))
      return Response.json({ authenticated: false, account: null });
    attempts++;
    if (attempts === 1) return pending.promise;
    if (attempts === 2) throw new TypeError("offline");
    return Response.json({
      authenticated: true,
      account: { id: "a", email: "user@example.com" },
    });
  };
  const view = await render(
    createElement(
      AuthProvider,
      null,
      createElement(AuthEntryScreen, { screen: "login" }),
    ),
    client(),
    "/mypage",
  );
  try {
    await until(() => assert(view.container.querySelector("form")));
    await fill(view.container, "email", "user@example.com");
    await fill(view.container, "password", "test-password-123");
    await submit(view.container);
    await until(() => assert.equal(attempts, 1));
    assert.equal(
      view.container.querySelector<HTMLButtonElement>('button[type="submit"]')!
        .disabled,
      true,
    );
    await submit(view.container);
    assert.equal(attempts, 1);
    await act(async () => {
      pending.resolve(
        Response.json(
          {
            statusCode: 401,
            code: "INVALID_CREDENTIALS",
            message: "private",
            requestId: "00000000-0000-4000-8000-000000000001",
          },
          { status: 401 },
        ),
      );
    });
    await until(() =>
      assert.match(
        view.container.textContent!,
        /이메일과 비밀번호를 다시 확인/,
      ),
    );
    await submit(view.container);
    await until(() => assert.match(view.container.textContent!, /연결을 확인/));
    assert.doesNotMatch(
      view.container.textContent!,
      /이메일과 비밀번호를 다시 확인/,
    );
    await submit(view.container);
    await until(() => assert(view.navigations.includes("/mypage")));
    assert.equal(attempts, 3);
    assert(
      !JSON.stringify(
        view.cache
          .getMutationCache()
          .getAll()
          .map((m) => m.state),
      ).includes("test-password-123"),
    );
  } finally {
    await view.unmount();
    globalThis.fetch = original;
  }
});
