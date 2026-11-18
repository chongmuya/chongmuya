import "./support/dom";
import { OwnerMenus } from "../features/owner/components/owner-menus";
import { OwnerRegistration } from "../features/owner/components/owner-registration";
import { emptyRegistration } from "../features/owner/schemas/registration.schema";
import type { RestaurantDraft } from "../features/owner/types/owner.types";
import { ReplyWorkspace } from "../features/merchant-replies/components/reply-workspace";
import type { MerchantInquiry } from "../features/merchant-replies/types/reply.types";
import { RecoveryScreen } from "../features/auth/components/recovery/recovery-screen";
import { KakaoCompleteScreen } from "../features/auth/components/kakao-complete-screen";
import { KakaoConnection } from "../features/auth/components/kakao-connection";
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
import { HomeScreen } from "../features/home/components/home-screen";
import { WorkspaceContent } from "../app/workspace-screen";
import { LinkEventGroupForm } from "../features/events/components/link-event-group-form";
import { EventForm } from "../features/events/components/event-form";
import { GroupForm } from "../features/groups/components/group-form";
import { AuthProvider } from "../features/auth/components/auth-provider";
import { AuthEntryScreen } from "../features/auth/components/auth-entry-screen";
import { GettingStartedScreen } from "../features/onboarding/components/getting-started-screen";
import { SignupScreen } from "../features/auth/components/signup/signup-screen";
import { previewTerms } from "../features/auth/components/preview/preview-fixtures";
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
  group = "",
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
            {
              value: new URLSearchParams({
                next,
                mode,
                ...(group ? { group } : {}),
              }),
            },
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

test("empty group management links to the reusable optional registration flow", async () => {
  const cache = client();
  const request: SessionRequest = async <T>() => [] as T;
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
    await until(() =>
      assert.match(view.container.textContent!, /아직 모임이 없습니다/),
    );
    assert(view.container.querySelector('a[href="/groups/new"]'));
    assert(view.container.querySelector('a[href="/events"]'));
    assert.equal(view.container.querySelector("form"), null);
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
      group: { id: "g1", name: "이전 이름", groupType: null, memberCount: 0 },
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
    const element =
      kind === "group"
        ? createElement(GroupForm, {
            accountId: "a",
            request,
            title: "모임 이름 수정",
            group: {
              id: "g1",
              name: "이전 이름",
              groupType: null,
              memberCount: 0,
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
    assert.deepEqual(view.navigations, []);
  }
});

test("account panel preserves failed-logout recovery and provides login navigation afterwards", async () => {
  const original = globalThis.fetch;
  let logoutCalls = 0;
  let authenticated = true;
  globalThis.fetch = async (input) => {
    const path = String(input);
    if (path.endsWith("restore"))
      return Response.json({
        authenticated,
        account: authenticated ? { id: "a", email: "user@example.com" } : null,
      });
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
    await until(() =>
      assert.match(view.container.textContent!, /계정으로 로그인했습니다/),
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
    await until(() =>
      assert(view.container.querySelector('a[href^="/auth?next="]')),
    );
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

test("start links and legacy signup redirect preserve safe destinations without the simple signup form", async () => {
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
        await until(() =>
          assert.match(
            view.container.textContent!,
            /회원가입 없이 사용해볼래요/,
          ),
        );
        await click(view.container, "회원가입 없이 사용해볼래요");
        assert(document.querySelector('dialog a[href="/"]'));
        await act(async () =>
          document
            .querySelector<HTMLButtonElement>('dialog [aria-label="닫기"]')!
            .click(),
        );
        assert.equal(document.querySelector("dialog"), null);
        const links = [...view.container.querySelectorAll("a")];
        const signup = new URL(
          links.find((a) => a.textContent === "처음 가입해요")!.href,
        );
        const login = new URL(
          links.find((a) => a.textContent === "이미 계정이 있어요")!.href,
        );
        assert.equal(signup.pathname, "/auth/signup");
        assert.equal(signup.searchParams.get("mode"), null);
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
        if (mode === "signup") {
          await until(() =>
            assert(
              view.navigations.some((url) => url.startsWith("/auth/signup?")),
            ),
          );
          assert.equal(view.container.querySelector("form"), null);
          assert.equal(
            new URL(view.navigations[0], "http://localhost").searchParams.get(
              "next",
            ),
            destination,
          );
          continue;
        }
        await until(() => assert(view.container.querySelector("form")));
        assert.equal(
          view.container.querySelector("form")!.getAttribute("aria-label"),
          "로그인",
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
      account: { id: "a", email: "user@example.com", accountType: "owner" },
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
    await fill(view.container, "password", "test-pass-123");
    await submit(view.container);
    await until(() => assert.equal(attempts, 1));
    await until(() =>
      assert.equal(
        view.container.querySelector<HTMLButtonElement>(
          'button[type="submit"]',
        )!.disabled,
        true,
      ),
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
      ).includes("test-pass-123"),
    );
  } finally {
    await view.unmount();
    globalThis.fetch = original;
  }
});

test("real signup screen requires phone receipt, recovers errors, keeps secrets out of Query and completes before safe navigation", async () => {
  const original = globalThis.fetch;
  const paths: string[] = [];
  const message = "총무야 가입 ABCDEF0123456789ABCDEF0123456789";
  const id = "00000000-0000-4000-8000-000000000099";
  let issued = 0;
  let checks = 0;
  let joined = 0;
  let termsFail = false;
  let terms = previewTerms;
  const now = Date.now();
  const proof = {
    id,
    phone: "01000000000",
    status: "pending",
    expiresAt: new Date(now + 300000).toISOString(),
    retryAt: new Date(now - 1).toISOString(),
    nextCheckAt: new Date(now - 1).toISOString(),
    serverNow: new Date(now).toISOString(),
    checksRemaining: 12,
  };
  const account = {
    id: "00000000-0000-4000-8000-000000000098",
    email: "real@example.test",
    accountType: null,
    name: "가입 이름",
    nickname: null,
    phone: proof.phone,
    phoneVerifiedAt: new Date(now).toISOString(),
    emailVerifiedAt: new Date(now).toISOString(),
  };
  globalThis.fetch = async (input, options) => {
    const path = String(input);
    paths.push(path);
    if (path.endsWith("restore"))
      return Response.json({
        authenticated: joined > 0,
        account: joined ? account : null,
      });
    if (path.endsWith("/terms")) {
      if (termsFail) throw new TypeError("offline");
      return Response.json({ terms });
    }
    if (path.endsWith("/context") || path.endsWith("/cancel"))
      return new Response(null, { status: 204 });
    if (path.endsWith("/email-verifications"))
      return Response.json({
        ...proof,
        email: account.email,
        attemptsRemaining: 5,
      });
    if (path.endsWith("/email-verifications/check")) {
      assert.equal(JSON.parse(String(options?.body)).code, "123456");
      return Response.json({
        ...proof,
        email: account.email,
        status: "verified",
        attemptsRemaining: 5,
      });
    }
    if (path.endsWith("/phone-verifications")) {
      if (++issued === 1)
        return Response.json(
          {
            statusCode: 503,
            code: "PHONE_VERIFICATION_UNAVAILABLE",
            message: "private",
            requestId: id,
          },
          { status: 503 },
        );
      return Response.json(
        {
          ...proof,
          receiver: "16663538",
          message,
          qrCode: "data:image/png;base64,aGVsbG8=",
        },
        { status: 201 },
      );
    }
    if (path.endsWith("/check")) {
      checks++;
      assert.deepEqual(JSON.parse(String(options?.body)), {
        id,
        phone: proof.phone,
      });
      return Response.json({
        ...proof,
        status: checks === 1 ? "pending" : "verified",
        checksRemaining: 12 - checks,
      });
    }
    assert(path.endsWith("/signup"));
    joined++;
    const body = JSON.parse(String(options?.body));
    assert.equal(body.phoneVerificationId, id);
    assert.equal(body.password, "test-pass-123");
    assert.equal(body.name, account.name);
    assert.equal(body.accountType, undefined);
    assert.equal(body.nickname, undefined);
    assert.equal(body.emailVerificationId, id);
    assert.equal(
      body.consents.find((term: { id: string }) => term.id === "marketing")
        .accepted,
      false,
    );
    assert.equal(body.passwordConfirm, undefined);
    assert.equal(body.verified, undefined);
    return Response.json({ authenticated: true, account }, { status: 201 });
  };
  const view = await render(
    createElement(AuthProvider, null, createElement(SignupScreen)),
    client(),
    "/mypage",
  );
  const noSecrets = () => {
    const cached = JSON.stringify([
      ...view.cache
        .getQueryCache()
        .getAll()
        .map((q) => q.state),
      ...view.cache
        .getMutationCache()
        .getAll()
        .map((m) => m.state),
    ]);
    for (const secret of ["test-pass-123", "123456", message, id])
      assert(!cached.includes(secret));
  };
  try {
    await until(() =>
      assert(view.container.querySelector('input[name="serviceTerms"]')),
    );
    for (const name of ["serviceTerms", "privacyCollection", "privacyPolicy"]) {
      await act(async () =>
        view.container
          .querySelector<HTMLInputElement>(`input[name="${name}"]`)!
          .click(),
      );
    }
    await submit(view.container);
    for (const [name, value] of Object.entries({
      email: account.email,
      name: account.name,
      password: "test-pass-123",
      passwordConfirm: "test-pass-123",
      phone: proof.phone,
    }))
      await fill(view.container, name, value);
    await click(view.container, "인증번호 보내기");
    await fill(view.container, "code", "123456");
    await click(view.container, "인증번호 확인");
    await submit(view.container);
    assert.match(view.container.textContent!, /휴대폰 인증을 완료/);
    assert.equal(joined, 0);
    await click(view.container, "휴대폰 인증 요청");
    await until(() =>
      assert.match(view.container.textContent!, /인증을 확인하지 못/),
    );
    assert.doesNotMatch(view.container.textContent!, /private/);
    await click(view.container, "휴대폰 인증 요청");
    await until(() => assert.match(view.container.textContent!, /16663538/));
    assert.match(
      view.container.querySelector('a[href^="sms:"]')!.getAttribute("href")!,
      /body=/,
    );
    assert(
      view.container.querySelector('img[alt="휴대폰 문자 앱을 여는 QR 코드"]'),
    );
    noSecrets();
    await click(view.container, "인증 결과 확인");
    await until(() => assert.equal(checks, 1));
    await submit(view.container);
    assert.equal(joined, 0);
    await click(view.container, "인증 결과 확인");
    await until(() =>
      assert.match(view.container.textContent!, /휴대폰 인증이 완료/),
    );
    noSecrets();
    const values = () =>
      Object.fromEntries(
        ["email", "name", "password", "phone"].map((name) => [
          name,
          view.container.querySelector<HTMLInputElement>(
            `input[name="${name}"]`,
          )!.value,
        ]),
      );
    const before = values();
    assert.deepEqual(before, {
      email: account.email,
      name: account.name,
      password: "test-pass-123",
      phone: proof.phone,
    });
    termsFail = true;
    await act(async () => {
      await view.cache.invalidateQueries({ queryKey: ["signup", "terms"] });
    });
    await until(() =>
      assert.match(view.container.textContent!, /입력한 정보는 유지/),
    );
    assert.deepEqual(values(), before);
    assert.match(view.container.textContent!, /이메일 인증이 완료/);
    assert.match(view.container.textContent!, /휴대폰 인증이 완료/);
    termsFail = false;
    terms = previewTerms.map((term) =>
      term.id === "serviceTerms" ? { ...term, version: "new-version" } : term,
    );
    await act(async () => {
      await view.cache.invalidateQueries({ queryKey: ["signup", "terms"] });
    });
    await until(() =>
      assert(view.container.querySelector('input[name="serviceTerms"]')),
    );
    assert.equal(
      view.container.querySelector<HTMLInputElement>(
        'input[name="serviceTerms"]',
      )!.checked,
      false,
    );
    assert.equal(
      view.container.querySelector<HTMLInputElement>(
        'input[name="privacyPolicy"]',
      )!.checked,
      true,
    );
    await act(async () =>
      view.container
        .querySelector<HTMLInputElement>('input[name="serviceTerms"]')!
        .click(),
    );
    await submit(view.container);
    assert.deepEqual(values(), before);
    assert.match(view.container.textContent!, /이메일 인증이 완료/);
    assert.match(view.container.textContent!, /휴대폰 인증이 완료/);
    assert(!paths.some((path) => path.endsWith("/cancel")));
    await submit(view.container);

    await until(() => assert.match(view.container.textContent!, /가입을 축하/));
    assert.equal(joined, 1);
    assert.deepEqual(view.navigations, []);
    noSecrets();
    await click(view.container, "다음");
    assert.deepEqual(view.navigations, ["/getting-started?next=%2Fmypage"]);
    assert(!paths.some((path) => /group/.test(path)));
  } finally {
    await view.unmount();
    globalThis.fetch = original;
  }
});

test("post-signup entry requires a restored session and skipping rejects external return paths", async () => {
  const original = globalThis.fetch;
  try {
    for (const authenticated of [false, true]) {
      globalThis.fetch = async () =>
        Response.json({
          authenticated,
          account: authenticated
            ? {
                id: "onboarding-user",
                accountType: "organizer",
                nickname: "총무",
                email: "test@example.test",
              }
            : null,
        });
      const view = await render(
        createElement(AuthProvider, null, createElement(GettingStartedScreen)),
        client(),
        "https://evil.example",
      );
      try {
        if (!authenticated) {
          await until(() =>
            assert.match(view.container.textContent!, /로그인이 필요/),
          );
          assert.equal(
            view.container.querySelector("a")?.getAttribute("href"),
            "/auth?next=%2Fgetting-started%3Fnext%3D%252Fevents",
          );
          assert.equal(
            view.container.querySelector('input[name="usage"]'),
            null,
          );
        } else {
          await until(() => assert.deepEqual(view.navigations, ["/events"]));
          assert.deepEqual(view.navigations, ["/events"]);
        }
      } finally {
        await view.unmount();
      }
    }
  } finally {
    globalThis.fetch = original;
  }
});

test("first setup resumes the missing step, updates session and preserves next without creating a group", async () => {
  const original = globalThis.fetch;
  try {
    for (const scenario of [
      "new-organizer",
      "resume",
      "owner",
      "configured",
    ] as const) {
      let account = {
        id: `setup-${scenario}`,
        email: "setup@example.test",
        name: "가입 이름",
        accountType:
          scenario === "owner"
            ? "owner"
            : scenario === "resume" || scenario === "configured"
              ? "organizer"
              : (null as string | null),
        nickname:
          scenario === "configured" ? "이미 설정" : (null as string | null),
      };
      const writes: unknown[] = [];
      globalThis.fetch = async (path, options) => {
        if (String(path).endsWith("restore"))
          return Response.json({ authenticated: true, account });
        assert(String(path).endsWith("/first-setup"));
        assert.equal(options?.method, "PATCH");
        const input = JSON.parse(String(options?.body));
        writes.push(input);
        account = { ...account, ...input };
        return Response.json(account);
      };
      const view = await render(
        createElement(AuthProvider, null, createElement(GettingStartedScreen)),
        client(),
        "/mypage",
      );
      try {
        if (scenario === "configured" || scenario === "owner") {
          await until(() => assert.deepEqual(view.navigations, ["/mypage"]));
          assert.equal(writes.length, 0);
          continue;
        }
        if (scenario !== "resume") {
          await until(() =>
            assert(view.container.querySelector('input[name="accountType"]')),
          );
          const value = "organizer";
          assert.equal(
            view.container.querySelector<HTMLInputElement>(
              'input[value="owner"]',
            )!.disabled,
            false,
          );
          assert.match(view.container.textContent!, /사장님이에요/);
          await act(async () =>
            view.container
              .querySelector<HTMLInputElement>(`input[value="${value}"]`)!
              .click(),
          );
          await submit(view.container);
          await until(() =>
            assert(view.container.querySelector("dialog[open]")),
          );
          assert.equal(writes.length, 0);
          await click(view.container, "총무로 계속하기");
          await until(() => assert.equal(writes.length, 1));
        }
        {
          await until(() =>
            assert(view.container.querySelector('input[name="nickname"]')),
          );
          assert.equal(
            view.container.querySelector('input[name="accountType"]'),
            null,
          );
          await fill(view.container, "nickname", "우리 총무");
          await submit(view.container);
          await until(() =>
            assert(view.container.querySelector('input[name="usage"]')),
          );
          assert.equal(account.nickname, "우리 총무");
          await click(view.container, "나중에 선택하기");
        }
        assert.deepEqual(view.navigations, ["/mypage"]);
      } finally {
        await view.unmount();
      }
    }
  } finally {
    globalThis.fetch = original;
  }
});

test("role confirmation cancels without saving, restores focus and prevents duplicate or cancelled pending writes", async () => {
  const original = globalThis.fetch;
  const pending = deferred<Response>();
  let writes = 0;
  const account = {
    id: "confirm-user",
    email: "confirm@example.test",
    name: "사장님 이름",
    accountType: null,
    nickname: null,
  };
  globalThis.fetch = async (path, options) => {
    if (String(path).endsWith("restore"))
      return Response.json({ authenticated: true, account });
    assert(String(path).endsWith("first-setup"));
    assert.deepEqual(JSON.parse(String(options?.body)), {
      accountType: "organizer",
    });
    writes++;
    return writes === 1
      ? pending.promise
      : Response.json({ ...account, accountType: "organizer" });
  };
  const view = await render(
    createElement(AuthProvider, null, createElement(GettingStartedScreen)),
    client(),
    "/mypage",
  );
  try {
    await until(() =>
      assert(view.container.querySelector('input[value="organizer"]')),
    );
    await act(async () =>
      view.container
        .querySelector<HTMLInputElement>('input[value="organizer"]')!
        .click(),
    );
    const trigger = view.container.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!;
    for (const cancel of ["button", "escape"]) {
      trigger.focus();
      await submit(view.container);
      const dialog = view.container.querySelector("dialog[open]")!;
      assert(dialog);
      assert.match(dialog.textContent!, /총무로 계속하시겠어요/);
      assert.match(dialog.textContent!, /사용자 유형은 이후 변경할 수 없어요/);
      assert.equal(document.activeElement?.textContent, "닫기");
      assert.equal(document.body.style.overflow, "hidden");
      assert(dialog.getAttribute("aria-labelledby"));
      assert(dialog.getAttribute("aria-describedby"));
      if (cancel === "button") await click(view.container, "닫기");
      else
        await act(async () => {
          dialog.dispatchEvent(
            new window.Event("cancel", { cancelable: true }),
          );
        });
      assert.equal(view.container.querySelector("dialog"), null);
      assert.equal(document.activeElement, trigger);
      assert.equal(document.body.style.overflow, "");
      assert.equal(writes, 0);
      assert.equal(
        view.container.querySelector<HTMLInputElement>(
          'input[value="organizer"]',
        )!.checked,
        true,
      );
    }
    await act(async () =>
      view.container
        .querySelector<HTMLInputElement>('input[value="organizer"]')!
        .click(),
    );
    trigger.focus();
    await submit(view.container);
    const dialog = view.container.querySelector("dialog")!;
    assert.match(dialog.textContent!, /총무로 계속하시겠어요/);
    const confirm = [...dialog.querySelectorAll("button")].find(
      (button) => button.textContent === "총무로 계속하기",
    )!;
    await act(async () => {
      confirm.click();
      confirm.click();
    });
    await until(() => {
      assert.equal(writes, 1);
      assert(
        [...dialog.querySelectorAll("button")].every(
          (button) => button.disabled,
        ),
      );
    });
    await act(async () => {
      dialog.dispatchEvent(new window.Event("cancel", { cancelable: true }));
    });
    assert(view.container.querySelector("dialog[open]"));
    await act(async () =>
      pending.resolve(
        Response.json(
          {
            statusCode: 503,
            code: "SERVICE_UNAVAILABLE",
            message: "PRIVATE PROVIDER DETAIL",
            requestId: "00000000-0000-4000-8000-000000000001",
          },
          { status: 503 },
        ),
      ),
    );
    await until(() => assert.equal(confirm.disabled, false));
    assert(view.container.querySelector("dialog[open]"));
    assert(dialog.querySelector('[role="alert"]'));
    assert.doesNotMatch(dialog.textContent!, /PRIVATE/);
    await click(view.container, "총무로 계속하기");
    await until(() =>
      assert.match(view.container.textContent!, /어떻게 불러드릴까요/),
    );
    assert.equal(writes, 2);
    assert.equal(view.container.querySelector("dialog"), null);
    assert.equal(document.body.style.overflow, "");
  } finally {
    await act(async () => pending.resolve(new Response(null, { status: 503 })));
    await view.unmount();
    globalThis.fetch = original;
  }
});

test("password recovery routes accept requests, remove fragment tokens, retry lookup and finish without automatic login or secret caching", async () => {
  const original = globalThis.fetch;
  const token = "t".repeat(43),
    password = "new-password12";
  let checks = 0,
    saved = 0;
  globalThis.fetch = async (path, options) => {
    if (String(path).endsWith("restore"))
      return Response.json({ authenticated: false, account: null });
    const input = JSON.parse(String(options?.body));
    if (String(path).endsWith("/request")) {
      assert.equal(input.email, "recover@example.test");
      assert.equal(input.next, "/mypage");
      return Response.json({ accepted: true }, { status: 202 });
    }
    assert.equal(input.token, token);
    if (String(path).endsWith("/check")) {
      if (++checks === 1) throw new TypeError("offline");
      return Response.json({
        valid: true,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      });
    }
    assert(String(path).endsWith("/confirm"));
    assert.equal(input.password, password);
    saved++;
    return new Response(null, { status: 204 });
  };
  let view = await render(
    createElement(AuthProvider, null, createElement(RecoveryScreen)),
    client(),
    "/mypage",
  );
  try {
    await fill(view.container, "email", "recover@example.test");
    await submit(view.container);
    await until(() =>
      assert.match(view.container.textContent!, /재설정 가능한 계정이면/),
    );
    await view.unmount();
    window.history.replaceState(
      null,
      "",
      `/auth/reset-password?next=%2Fmypage#token=${token}`,
    );
    view = await render(
      createElement(
        AuthProvider,
        null,
        createElement(RecoveryScreen, { reset: true }),
      ),
      client(),
      "/mypage",
    );
    await until(() =>
      assert.match(view.container.textContent!, /링크를 확인할 수 없어요/),
    );
    assert.equal(window.location.hash, "");
    assert.equal(
      new URLSearchParams(window.location.search).get("next"),
      "/mypage",
    );
    await click(view.container, "링크 다시 확인");
    await until(() =>
      assert(view.container.querySelector('input[name="password"]')),
    );
    await fill(view.container, "password", password);
    await fill(view.container, "passwordConfirm", password);
    await submit(view.container);
    await until(() =>
      assert.match(view.container.textContent!, /비밀번호를 변경했어요/),
    );
    assert.equal(saved, 1);
    assert(view.container.querySelector('a[href="/auth?next=%2Fmypage"]'));
    assert.deepEqual(view.navigations, []);
    const cached = JSON.stringify([
      ...view.cache
        .getQueryCache()
        .getAll()
        .map((query) => query.state),
      ...view.cache
        .getMutationCache()
        .getAll()
        .map((mutation) => mutation.state),
    ]);
    assert(!cached.includes(token));
    assert(!cached.includes(password));
    assert.equal(window.localStorage.length, 0);
    assert.equal(window.sessionStorage.length, 0);
  } finally {
    await view.unmount();
    globalThis.fetch = original;
    window.history.replaceState(null, "", "/");
  }
});

test("Kakao button bypasses empty email form validation and linking requires consent without caching passwords or navigating after exit", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  const pending = deferred<Response>();
  globalThis.fetch = async (path) => {
    if (String(path).endsWith("restore"))
      return Response.json({ authenticated: false, account: null });
    assert(String(path).endsWith("kakao/start"));
    calls++;
    return Response.json(
      {
        statusCode: 503,
        code: "KAKAO_UNAVAILABLE",
        message: "private",
        requestId: "00000000-0000-4000-8000-000000000001",
      },
      { status: 503 },
    );
  };
  let view = await render(
    createElement(
      AuthProvider,
      null,
      createElement(AuthEntryScreen, { screen: "login" }),
    ),
  );
  try {
    await until(() =>
      assert(view.container.querySelector('input[name="email"]')),
    );
    await click(view.container, "카카오 계정으로 계속하기");
    await until(() => assert.equal(calls, 1));
    await until(() =>
      assert.match(
        view.container.textContent!,
        /카카오 인증을 사용할 수 없습니다/,
      ),
    );
    assert.equal(
      view.container.querySelector('input[aria-invalid="true"]'),
      null,
    );
    assert(view.container.querySelector('a[href^="/auth/recovery?next="]'));
    await view.unmount();
    globalThis.fetch = async (path, options) => {
      if (String(path).endsWith("restore"))
        return Response.json({
          authenticated: true,
          account: {
            id: "link-user",
            email: "link@example.test",
            accountType: "owner",
            nickname: null,
          },
        });
      if (String(path).endsWith("/connection"))
        return Response.json({ linked: false, canLink: true });
      assert(String(path).endsWith("link/start"));
      assert.deepEqual(JSON.parse(String(options?.body)), {
        password: "link-password1",
        consent: true,
      });
      calls++;
      return pending.promise;
    };
    view = await render(
      createElement(
        AuthProvider,
        null,
        createElement(KakaoConnection, { accountId: "link-user" }),
      ),
    );
    await until(() =>
      assert(view.container.querySelector('input[name="password"]')),
    );
    await fill(view.container, "password", "link-password1");
    await submit(view.container);
    assert.equal(calls, 1);
    await act(async () =>
      view.container
        .querySelector<HTMLInputElement>('input[name="consent"]')!
        .click(),
    );
    await submit(view.container);
    await until(() => assert.equal(calls, 2));
    await submit(view.container);
    assert.equal(calls, 2);
    assert(
      !JSON.stringify(
        view.cache
          .getMutationCache()
          .getAll()
          .map((mutation) => mutation.state),
      ).includes("link-password1"),
    );
    await view.unmount();
    await act(async () =>
      pending.resolve(
        Response.json({
          authorizationUrl:
            "https://kauth.kakao.com/oauth/authorize?state=test",
        }),
      ),
    );
    assert.deepEqual(view.navigations, []);
  } finally {
    globalThis.fetch = original;
    pending.resolve(new Response(null, { status: 503 }));
    if (view.container.isConnected) await view.unmount();
  }
});

test("Kakao completion cancels without logging in and directs conflicting identities to their existing login method", async () => {
  const original = globalThis.fetch;
  try {
    for (const kind of ["existing", "login", "link"] as const) {
      let cancelled = 0;
      globalThis.fetch = async (path) => {
        if (String(path).endsWith("restore"))
          return Response.json({
            authenticated: kind === "link",
            account:
              kind === "link"
                ? {
                    id: "linked",
                    accountType: "owner",
                    email: "linked@example.test",
                  }
                : null,
          });
        if (String(path).endsWith("/status"))
          return Response.json({
            id: "00000000-0000-4000-8000-000000000001",
            kind,
            email: "existing@example.test",
            trustedEmail: true,
            next: "/mypage",
            expiresAt: new Date(Date.now() + 60000).toISOString(),
          });
        assert(String(path).endsWith("/cancel"));
        cancelled++;
        return new Response(null, { status: 204 });
      };
      const view = await render(
        createElement(AuthProvider, null, createElement(KakaoCompleteScreen)),
      );
      try {
        if (kind === "existing") {
          await until(() =>
            assert.match(view.container.textContent!, /기존 계정으로 로그인/),
          );
          assert(
            view.container.querySelector('a[href="/auth?next=%2Fmypage"]'),
          );
          assert.equal(
            view.container.querySelector('a[href^="/auth/recovery"]'),
            null,
          );
        } else {
          await until(() =>
            assert.match(
              view.container.textContent!,
              kind === "login" ? /로그인 완료하기/ : /연결 완료하기/,
            ),
          );
          await click(view.container, "취소");
          await until(() => assert.equal(cancelled, 1));
          assert.deepEqual(view.navigations, [
            kind === "link" ? "/mypage" : "/auth",
          ]);
        }
      } finally {
        await view.unmount();
      }
    }
  } finally {
    globalThis.fetch = original;
  }
});

test("Kakao signup keeps verified provider email separate, never asks for a password and shows completion before first setup", async () => {
  const original = globalThis.fetch;
  const id = "00000000-0000-4000-8000-000000000079",
    now = Date.now();
  const proof = {
    id,
    phone: "01000000000",
    status: "pending",
    expiresAt: new Date(now + 300000).toISOString(),
    retryAt: new Date(now - 1).toISOString(),
    nextCheckAt: new Date(now - 1).toISOString(),
    serverNow: new Date(now).toISOString(),
    checksRemaining: 12,
  };
  const account = {
    id: "new-kakao",
    email: "kakao@example.test",
    name: "직접 입력 이름",
    accountType: null,
    nickname: null,
  };
  let joined = 0,
    emailRequests = 0;
  globalThis.fetch = async (path, options) => {
    if (String(path).endsWith("restore"))
      return Response.json({
        authenticated: joined > 0,
        account: joined ? account : null,
      });
    if (String(path).endsWith("kakao/status"))
      return Response.json({
        id,
        kind: "signup",
        email: account.email,
        trustedEmail: true,
        next: "/mypage",
        expiresAt: new Date(now + 600000).toISOString(),
      });
    if (String(path).endsWith("/terms"))
      return Response.json({ terms: previewTerms });
    if (String(path).endsWith("/context") || String(path).endsWith("/cancel"))
      return new Response(null, { status: 204 });
    if (String(path).endsWith("/email-verifications")) {
      emailRequests++;
      return Response.json({
        ...proof,
        email: "changed@example.test",
        attemptsRemaining: 5,
      });
    }
    if (String(path).endsWith("/phone-verifications"))
      return Response.json(
        {
          ...proof,
          receiver: "16663538",
          message: "test-only-message",
          qrCode: "data:image/png;base64,aGVsbG8=",
        },
        { status: 201 },
      );
    if (String(path).endsWith("/phone-verifications/check"))
      return Response.json({ ...proof, status: "verified" });
    assert(String(path).endsWith("kakao/signup"));
    const body = JSON.parse(String(options?.body));
    assert.equal(body.password, undefined);
    assert.equal(body.passwordConfirm, undefined);
    assert.equal(body.emailVerificationId, undefined);
    assert.equal(body.name, account.name);
    assert.equal(body.phoneVerificationId, id);
    joined++;
    return Response.json({ authenticated: true, account }, { status: 201 });
  };
  const view = await render(
    createElement(AuthProvider, null, createElement(KakaoCompleteScreen)),
  );
  try {
    await until(() =>
      assert(view.container.querySelector('input[name="serviceTerms"]')),
    );
    for (const name of ["serviceTerms", "privacyCollection", "privacyPolicy"])
      await act(async () =>
        view.container
          .querySelector<HTMLInputElement>(`input[name="${name}"]`)!
          .click(),
      );
    await submit(view.container);
    assert.equal(view.container.querySelector('input[name="password"]'), null);
    assert.match(view.container.textContent!, /카카오에서 확인한 이메일/);
    assert.equal(
      view.container.querySelector<HTMLInputElement>('input[name="name"]')!
        .value,
      "",
    );
    await fill(view.container, "email", "changed@example.test");
    assert.doesNotMatch(
      view.container.textContent!,
      /카카오에서 확인한 이메일/,
    );
    await click(view.container, "인증번호 보내기");
    assert.equal(emailRequests, 1);
    await fill(view.container, "email", account.email);
    await fill(view.container, "name", account.name);
    await fill(view.container, "phone", proof.phone);
    await click(view.container, "휴대폰 인증 요청");
    await click(view.container, "인증 결과 확인");
    await submit(view.container);
    await until(() => assert.match(view.container.textContent!, /가입을 축하/));
    assert.equal(joined, 1);
    assert.deepEqual(view.navigations, []);
    await click(view.container, "다음");
    assert.deepEqual(view.navigations, ["/getting-started?next=%2Fmypage"]);
  } finally {
    await view.unmount();
    globalThis.fetch = original;
  }
});

test("expired Kakao signup leaves the form and restarts a fresh server attempt with a safe next", async () => {
  const original = globalThis.fetch;
  let starts = 0;
  globalThis.fetch = async (path, options) => {
    if (String(path).endsWith("restore"))
      return Response.json({ authenticated: false, account: null });
    if (String(path).endsWith("kakao/status"))
      return Response.json({
        id: "00000000-0000-4000-8000-000000000079",
        kind: "signup",
        email: null,
        trustedEmail: false,
        next: "/mypage",
        expiresAt: new Date(Date.now() + 150).toISOString(),
      });
    if (String(path).endsWith("/terms"))
      return Response.json({ terms: previewTerms });
    assert(String(path).endsWith("kakao/start"));
    assert.deepEqual(JSON.parse(String(options?.body)), { next: "/mypage" });
    starts++;
    // Exercise retry failure without navigating jsdom to an external provider.
    return Response.json(
      {
        statusCode: 503,
        code: "KAKAO_CONFIGURATION",
        message: "private-provider-response",
        requestId: "00000000-0000-4000-8000-000000000001",
      },
      { status: 503 },
    );
  };
  const view = await render(
    createElement(AuthProvider, null, createElement(KakaoCompleteScreen)),
  );
  try {
    await until(() =>
      assert.match(view.container.textContent!, /인증 시간이 만료/),
    );
    assert.equal(view.container.querySelector("form"), null);
    await click(view.container, "카카오 계정으로 계속하기");
    await until(() => assert.equal(starts, 1));
    await until(() =>
      assert.match(view.container.textContent!, /로그인 설정 확인/),
    );
    assert.doesNotMatch(view.container.textContent!, /private-provider/);
    assert.deepEqual(view.navigations, []);
  } finally {
    await view.unmount();
    globalThis.fetch = original;
  }
});

test("recovery never carries an external or authentication-loop destination", async () => {
  const original = globalThis.fetch;
  const destinations: string[] = [];
  globalThis.fetch = async (path, options) => {
    if (String(path).endsWith("restore"))
      return Response.json({ authenticated: false, account: null });
    assert(String(path).endsWith("password-reset/request"));
    destinations.push(JSON.parse(String(options?.body)).next);
    return Response.json({ accepted: true }, { status: 202 });
  };
  try {
    for (const destination of [
      "https://evil.example",
      "/auth/reset-password",
    ]) {
      const view = await render(
        createElement(AuthProvider, null, createElement(RecoveryScreen)),
        client(),
        destination,
      );
      try {
        await fill(view.container, "email", "test@example.test");
        await submit(view.container);
        await until(() =>
          assert.match(view.container.textContent!, /재설정 가능한 계정이면/),
        );
        assert(view.container.querySelector('a[href="/auth?next=%2Fevents"]'));
      } finally {
        await view.unmount();
      }
    }
    assert.deepEqual(destinations, ["/events", "/events"]);
  } finally {
    globalThis.fetch = original;
  }
});

test("home preserves the selected group and never falls back to personal creation during failed or unresolved reads", async () => {
  const original = globalThis.fetch;
  try {
    for (const scenario of [
      "selected",
      "empty",
      "inaccessible",
      "failed",
    ] as const) {
      const pending = deferred<Response>();
      let eventReads = 0;
      globalThis.fetch = async (path) => {
        const url = String(path);
        if (url.endsWith("restore"))
          return Response.json({
            authenticated: true,
            account: {
              id: "home-user",
              email: "home@example.test",
              name: "이름",
              nickname: "총무",
              accountType: "organizer",
            },
          });
        if (url.endsWith("/groups")) return pending.promise;
        if (url.includes("/events")) {
          eventReads++;
          return Response.json([]);
        }
        throw new Error("unexpected path");
      };
      const view = await render(
        createElement(AuthProvider, null, createElement(HomeScreen)),
        client(),
        "",
        "",
        scenario === "empty"
          ? ""
          : scenario === "inaccessible"
            ? "missing"
            : "second",
      );
      try {
        await until(() =>
          assert.match(view.container.textContent!, /모임 불러오는 중/),
        );
        assert(!view.container.querySelector('a[href^="/events"]'));
        assert.equal(eventReads, 0);
        await act(async () =>
          pending.resolve(
            scenario === "failed"
              ? Response.json(
                  { code: "SERVICE_UNAVAILABLE", statusCode: 503 },
                  { status: 503 },
                )
              : Response.json(
                  scenario === "empty"
                    ? []
                    : [
                        {
                          id: "first",
                          name: "첫 모임",
                          groupType: null,
                          memberCount: 0,
                        },
                        {
                          id: "second",
                          name: "두 번째 모임",
                          groupType: null,
                          memberCount: 2,
                        },
                      ],
                ),
          ),
        );
        if (scenario === "selected") {
          await until(() =>
            assert(
              view.container.querySelector('a[href="/events?group=second"]'),
            ),
          );
          assert(
            view.container.querySelector(
              'nav a[aria-current="page"][href="/?group=second"]',
            ),
          );
          assert(
            view.container.querySelector('nav a[href="/mypage?group=second"]'),
          );
          assert.equal(
            [...view.container.querySelectorAll("a")]
              .find((a) => a.textContent?.includes("새 행사"))
              ?.getAttribute("href"),
            "/events?group=second",
          );
        } else if (scenario === "empty") {
          await until(() =>
            assert(view.container.querySelector('a[href="/events"]')),
          );
        } else {
          await until(() =>
            assert(view.container.querySelector('[role="alert"]')),
          );
          assert(!view.container.querySelector('a[href^="/events"]'));
          assert.equal(eventReads, 0);
          if (scenario === "failed")
            assert(
              view.container.querySelector(
                'nav a[aria-current="page"][href="/?group=second"]',
              ),
            );
        }
      } finally {
        pending.resolve(Response.json([]));
        await view.unmount();
      }
    }
  } finally {
    globalThis.fetch = original;
  }
});

const merchantAccount = {
  id: "752fb868-6dc0-4ef8-8f4a-0ed7049ff010",
  accountType: "owner" as const,
  email: "owner@example.test",
  name: "테스트 사장님",
  nickname: null,
  phone: "01012345678",
  phoneVerifiedAt: "2026-01-01T00:00:00Z",
  emailVerifiedAt: "2026-01-01T00:00:00Z",
};
test("existing owner menu response fields cannot leak into edit input; edit and stop sale persist", async () => {
  const menu = {
    id: crypto.randomUUID(),
    restaurantId: crypto.randomUUID(),
    name: "기존 메뉴",
    kind: "REGULAR",
    price: null,
    unit: "1인분",
    available: true,
    position: 0,
  };
  let version = 1;
  let written: Record<string, unknown> | undefined;
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    if (options?.method === "PUT") {
      const body = JSON.parse(String(options.body));
      assert.equal(body.version, version);
      assert.equal(body.menu.restaurantId, undefined);
      written = body.menu;
      Object.assign(menu, body.menu);
      return { version: ++version } as T;
    }
    return { version, menus: [menu] } as T;
  };
  const view = await render(
    createElement(OwnerMenus, {
      account: merchantAccount,
      request,
      restaurantId: menu.restaurantId,
      onNavigate: () => {},
    }),
  );
  try {
    await until(() => assert.match(view.container.textContent!, /기존 메뉴/));
    await click(view.container, "수정");
    await fill(view.container, "name", "수정 메뉴");
    await act(async () =>
      view.container
        .querySelector<HTMLInputElement>('input[name="available"]')!
        .click(),
    );
    await submit(view.container);
    await until(() => assert.equal(written?.available, false));
    assert.equal(written?.name, "수정 메뉴");
    assert.equal(written?.id, menu.id);
    await click(view.container, "수정");
    await fill(view.container, "name", "다시 수정");
    await submit(view.container);
    await until(() => assert.equal(written?.name, "다시 수정"));
  } finally {
    await view.unmount();
  }
});

test("menu editing keeps its base version across background refetch", async () => {
  const menu = {
    id: crypto.randomUUID(),
    name: "원본",
    kind: "REGULAR",
    price: 1000,
    unit: "개",
    available: true,
    position: 0,
  };
  let version = 1;
  let submittedVersion: number | undefined;
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    if (options?.method === "PUT") {
      submittedVersion = JSON.parse(String(options.body)).version;
      throw new ApiError("", 409, "RESTAURANT_VERSION_CONFLICT");
    }
    return structuredClone({ version, menus: [menu] }) as T;
  };
  const view = await render(
    createElement(OwnerMenus, {
      account: merchantAccount,
      request,
      restaurantId: crypto.randomUUID(),
      onNavigate: () => {},
    }),
  );
  try {
    await until(() => assert.match(view.container.textContent!, /원본/));
    await click(view.container, "수정");
    await fill(view.container, "name", "내 입력");
    version = 2;
    menu.name = "다른 탭 수정";
    await act(async () => {
      await view.cache.refetchQueries();
    });
    await until(() =>
      assert.match(view.container.textContent!, /다른 탭 수정/),
    );
    await submit(view.container);
    assert.equal(
      submittedVersion,
      undefined,
      "background refetch must not grant a stale form the newest version",
    );
    assert.match(view.container.textContent!, /내 입력으로 다시 적용/);
    await click(view.container, "내 입력으로 다시 적용");
    await submit(view.container);
    await until(() => assert.equal(submittedVersion, 2));
    await until(() =>
      assert.match(view.container.textContent!, /내 입력으로 다시 적용/),
    );
    assert.equal(
      view.container.querySelector<HTMLInputElement>('input[name="name"]')!
        .value,
      "내 입력",
    );
  } finally {
    await view.unmount();
  }
});

test("draft autosave recovers a lost success response and uses the saved version on the next edit", async () => {
  let stored: RestaurantDraft = {
    id: crypto.randomUUID(),
    restaurantId: null,
    version: 1,
    data: emptyRegistration(),
    step: 0,
    selectedAddress: null,
    verifiedPhone: null,
    submitted: false,
  };
  const versions: number[] = [];
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    if (options?.method === "PUT") {
      const body = JSON.parse(String(options.body));
      versions.push(body.version);
      assert.equal(body.version, stored.version);
      stored = {
        ...stored,
        version: stored.version + 1,
        data: body.data,
        step: body.step,
      };
      if (versions.length === 1) throw new TypeError("response lost");
    }
    return structuredClone(stored) as T;
  };
  const view = await render(
    createElement(OwnerRegistration, {
      account: merchantAccount,
      request,
      draft: structuredClone(stored),
      onNavigate: () => {},
    }),
  );
  try {
    await fill(view.container, "name", "응답 유실 후 유지");
    await click(view.container, "초안 저장");
    await until(() => assert.equal(stored.version, 2));
    await fill(view.container, "name", "이어서 수정");
    await click(view.container, "초안 저장");
    await until(() => assert.equal(stored.data.name, "이어서 수정"));
    assert.deepEqual(versions, [1, 2]);
    assert.doesNotMatch(
      view.container.textContent!,
      /초안을 저장하지 못했어요/,
    );
  } finally {
    await view.unmount();
  }
});

test("draft conflicts preserve local input and require review before adopting current draft and restaurant versions", async () => {
  const draft: RestaurantDraft = {
    id: crypto.randomUUID(),
    restaurantId: crypto.randomUUID(),
    version: 1,
    restaurantVersion: 1,
    data: emptyRegistration(),
    step: 0,
    selectedAddress: null,
    verifiedPhone: null,
    submitted: false,
  };
  const latest: RestaurantDraft = {
    ...draft,
    version: 3,
    data: { ...draft.data, name: "다른 탭의 초안" },
    currentRestaurant: {
      version: 8,
      published: true,
      data: { ...draft.data, name: "현재 매장" },
    },
  };
  const writes: Record<string, unknown>[] = [];
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    if (options?.method === "PUT") {
      const body = JSON.parse(String(options.body));
      writes.push(body);
      if (body.version !== latest.version)
        throw new ApiError("", 409, "RESTAURANT_VERSION_CONFLICT");
      return {
        ...latest,
        version: 4,
        restaurantVersion: 8,
        data: body.data,
      } as T;
    }
    return structuredClone(latest) as T;
  };
  const view = await render(
    createElement(OwnerRegistration, {
      account: merchantAccount,
      request,
      draft,
      onNavigate: () => {},
    }),
  );
  try {
    await fill(view.container, "name", "작성 중인 내 입력");
    await click(view.container, "초안 저장");
    await until(() =>
      assert.match(view.container.textContent!, /최신 정보 확인이 필요/),
    );
    assert.equal(
      view.container.querySelector<HTMLInputElement>('input[name="name"]')!
        .value,
      "작성 중인 내 입력",
    );
    assert.equal(writes.length, 1);
    await click(view.container, "최신 내용 확인 후 내 입력으로 이어가기");
    await until(() => assert.equal(writes.length, 2));
    assert.equal(writes[1].version, 3);
    assert.equal(writes[1].restaurantVersion, 8);
    assert.equal(
      (writes[1].data as { name: string }).name,
      "작성 중인 내 입력",
    );
  } finally {
    await view.unmount();
  }
});

test("merchant reply keeps unsaved input through failed refetch and recovery", async () => {
  const inquiry = merchantInquiryFixture();
  let offline = false,
    submitted = "";
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    if (options?.method === "POST") {
      submitted = JSON.parse(String(options.body)).reply.reason;
      return { version: ++inquiry.version, response: null } as T;
    }
    if (offline) throw new ApiError("", 503, "NETWORK_ERROR");
    return structuredClone(inquiry) as T;
  };
  const view = await render(
    createElement(ReplyWorkspace, {
      targetId: inquiry.targetId,
      access: { kind: "owner", accountId: merchantAccount.id, request },
    }),
  );
  try {
    await until(() => assert(view.container.querySelector("form")));
    await act(async () => {
      const select = view.container.querySelector("select")!;
      select.value = "DECLINE";
      select.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    const textarea = view.container.querySelector<HTMLTextAreaElement>(
      'textarea[name="reason"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(textarea, "작성 중인 거절 사유");
      textarea.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    offline = true;
    await act(async () => {
      await view.cache.refetchQueries();
    });
    await until(() =>
      assert.match(view.container.textContent!, /작성 중인 답변은 유지/),
    );
    assert.equal(
      view.container.querySelector('textarea[name="reason"]'),
      textarea,
    );
    assert.equal(textarea.value, "작성 중인 거절 사유");
    offline = false;
    await click(view.container, "다시 확인");
    await until(() =>
      assert.doesNotMatch(
        view.container.textContent!,
        /최신 문의를 불러오지 못했어요/,
      ),
    );
    await submit(view.container);
    await until(() => assert.equal(submitted, "작성 중인 거절 사유"));
  } finally {
    await view.unmount();
  }
});

function merchantInquiryFixture(): MerchantInquiry {
  const startsAt = new Date(Date.now() + 86400000).toISOString();
  const inquiry: MerchantInquiry = {
    targetId: crypto.randomUUID(),
    restaurantName: "테스트 매장",
    organizerName: "테스트 총무",
    version: 0,
    response: null,
    linkExpiresAt: startsAt,
    snapshot: {
      eventName: "테스트 행사",
      groupName: null,
      startsAt,
      expectedGuests: 20,
      region: "건대입구",
      space: "ANY",
      seating: "ANY",
      seatingImportance: null,
      spaceImportance: null,
      budgetBasis: null,
      budgetAmount: null,
      alcohol: null,
      additionalRequests: null,
    },
    defaults: {
      proposal: {
        startsAt,
        expectedGuests: 20,
        space: "ANY",
        seating: "ANY",
        minimumSpend: null,
        separateFee: null,
        deposit: { kind: "UNKNOWN", amount: null },
        menuDeadlineAt: null,
        note: "",
      },
      expiresAt: startsAt,
      depositDescription: null,
      bookingDescription: null,
      menuDescription: null,
    },
  };
  return inquiry;
}

test("merchant access expiration keeps current-tab input and stops writes and focus retries", async (t) => {
  const inquiry = merchantInquiryFixture();
  let denied = false,
    requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    return denied
      ? Response.json(
          {
            statusCode: 403,
            code: "MERCHANT_ACCESS_EXPIRED",
            message: "ignored",
            requestId: crypto.randomUUID(),
          },
          { status: 403 },
        )
      : Response.json(inquiry);
  });
  const view = await render(
    createElement(ReplyWorkspace, {
      targetId: inquiry.targetId,
      access: {
        kind: "link",
        access: "test-capability",
        scope: "test-scope",
        accessExpiresAt: new Date(Date.now() + 3600000).toISOString(),
        linkExpiresAt: inquiry.linkExpiresAt!,
      },
    }),
  );
  try {
    await until(() => assert(view.container.querySelector("form")));
    await act(async () => {
      const select = view.container.querySelector("select")!;
      select.value = "DECLINE";
      select.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    const field = view.container.querySelector<HTMLTextAreaElement>(
      'textarea[name="reason"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(field, "만료되어도 보존할 입력");
      field.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    denied = true;
    await act(async () => {
      await view.cache.refetchQueries();
    });
    await until(() =>
      assert.match(view.container.textContent!, /문자에 있는 원래 링크/),
    );
    const count = requests;
    await submit(view.container);
    await act(async () => {
      await view.cache.refetchQueries();
    });
    assert.equal(requests, count);
    assert.equal(field.value, "만료되어도 보존할 입력");
    assert(view.container.querySelector("fieldset")!.disabled);
  } finally {
    await view.unmount();
  }
});
