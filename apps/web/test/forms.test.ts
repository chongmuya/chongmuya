import "./support/dom";
import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { WorkspaceContent } from "../app/workspace-screen";
import { EventForm } from "../features/events/components/event-form";
import { GroupForm } from "../features/groups/components/group-form";
import { AuthProvider } from "../features/auth/components/auth-provider";
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
async function render(element: ReactElement, cache = client()) {
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
          createElement(QueryClientProvider, { client: cache }, element),
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

test("first-group validation and creation update the account cache and navigate from a direct event URL", async () => {
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
      groupId: "foreign",
      eventId: "old",
      mode: "events",
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
      assert.deepEqual(view.navigations, ["/events?group=g-new"]),
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

test("event form submits Korean time, updates detail and invalidates only its list", async () => {
  let body: unknown;
  const event = {
    id: "e1",
    groupId: "g1",
    name: "새 행사",
    scheduledAt: "2026-11-14T09:30:00.000Z",
  };
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    body = JSON.parse(String(options?.body));
    return event as T;
  };
  const cache = client();
  cache.setQueryData(["user", "a", "groups", "g1", "events"], []);
  cache.setQueryData(["user", "a", "groups", "g2", "events"], []);
  const view = await render(
    createElement(EventForm, { accountId: "a", groupId: "g1", request }),
    cache,
  );
  try {
    await fill(view.container, "name", " 새 행사 ");
    await fill(view.container, "date", "2026-11-14T18:30");
    await submit(view.container);
    await until(() =>
      assert.deepEqual(view.navigations, ["/events?group=g1&event=e1"]),
    );
    assert.deepEqual(body, { name: "새 행사", scheduledAt: event.scheduledAt });
    assert.deepEqual(
      cache.getQueryData(["user", "a", "groups", "g1", "events", "e1"]),
      event,
    );
    assert.equal(
      cache.getQueryState(["user", "a", "groups", "g1", "events"])
        ?.isInvalidated,
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
    const request: SessionRequest = async <T>() => {
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
        : createElement(EventForm, { accountId: "a", groupId: "g1", request });
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
