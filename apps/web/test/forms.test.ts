import { chooseDate, chooseTime } from "./support/date-controls";
import "./support/dom";
import { act, createElement } from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  client,
  render,
  until,
  fill,
  submit,
  click,
  deferred,
} from "./support/form-dom";
import { RecoveryScreen } from "../features/auth/components/recovery/recovery-screen";
import { KakaoCompleteScreen } from "../features/auth/components/kakao-complete-screen";
import { KakaoConnection } from "../features/auth/components/kakao-connection";
import { HomeEntryProvider } from "../features/home/components/home-entry-provider";
import { HomeScreen } from "../features/home/components/home-screen";
import { WorkspaceContent } from "../app/workspace-screen";
import { EventForm } from "../features/events/components/event-form";
import { eventKeys } from "../features/events/api/events.queries";
import { ConditionsForm } from "../features/reservations/components/conditions-form";
import { initialConditions } from "../features/reservations/schemas/conditions.schema";
import { GroupForm } from "../features/groups/components/group-form";
import { AuthProvider } from "../features/auth/components/auth-provider";
import { AuthEntryScreen } from "../features/auth/components/auth-entry-screen";
import { GettingStartedScreen } from "../features/onboarding/components/getting-started-screen";
import { SignupScreen } from "../features/auth/components/signup/signup-screen";
import { previewTerms } from "./support/signup-terms";
import { AuthScreen } from "../features/auth/components/auth-screen";
import type { SessionRequest } from "../features/auth/types";
import { ApiError } from "../shared/http/api-error";
import { koreanDateOnly } from "../shared/lib/korean-date";

test("event creation hands the reservation date and guest estimate to the next step", async () => {
  const eventId = "00000000-0000-4000-8000-000000000221";
  const date = koreanDateOnly(new Date(Date.now() + 3 * 86400_000));
  let body: Record<string, unknown> | undefined;
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    if (options?.method !== "POST") return [] as T;
    body = JSON.parse(String(options.body));
    return {
      id: eventId,
      name: body?.name,
      scheduledAt: body?.scheduledAt,
    } as T;
  };
  const cache = client();
  const view = await render(
    createElement(EventForm, { accountId: "a", request }),
    cache,
  );
  try {
    await fill(view.container, "name", "예약 행사");
    const reserve = [
      ...view.container.querySelectorAll<HTMLInputElement>("input[type=radio]"),
    ].find((radio) =>
      radio.closest("label")?.textContent?.includes("예약이 필요해요"),
    );
    assert(reserve);
    await act(async () => reserve.click());
    await submit(view.container);
    await until(() =>
      assert.match(view.container.textContent!, /날짜를 입력해 주세요/),
    );
    assert.equal(body, undefined);
    await chooseDate(view.container, "date", date);
    await chooseTime(view.container, "time", "00:00");
    await fill(view.container, "expectedGuests", "24");
    await submit(view.container);
    await until(() =>
      assert.deepEqual(view.navigations, [
        `/restaurants?event=${eventId}&inquiry=1`,
      ]),
    );
    assert.equal(
      (body as Record<string, unknown> | undefined)?.scheduledAt,
      new Date(`${date}T00:00:00+09:00`).toISOString(),
    );
    assert.equal(
      cache.getQueryData(eventKeys.guestEstimate("a", eventId)),
      "24",
    );
    assert.equal(
      cache.getQueryData(eventKeys.guestEstimate("b", eventId)),
      undefined,
    );
    assert.equal(
      (body as Record<string, unknown> | undefined)?.expectedGuests,
      undefined,
    );
  } finally {
    await view.unmount();
  }
});

test("first inquiry summarizes a saved date and disables reverse auction, while editable schedules keep both pickers", async () => {
  const startsAt = "2099-12-01T09:30:45.000Z";
  const initial = {
    ...initialConditions(
      { name: "총무", phone: "01000000000" } as Parameters<
        typeof initialConditions
      >[0],
      startsAt,
    ),
    expectedGuests: "24",
  };
  for (const savedStartsAt of [startsAt, undefined]) {
    let next: typeof initial | undefined;
    const view = await render(
      createElement(ConditionsForm, {
        initial,
        savedStartsAt,
        onContinue: (values) => {
          next = values;
        },
      }),
    );
    try {
      assert.match(view.container.textContent!, /건대입구 · 세종대/);
      assert.match(
        view.container.textContent!,
        /사장님 제안 받기 \(역경매\)준비 중/,
      );
      assert.equal(
        view.container.querySelectorAll('input[name="findingMethod"]:disabled')
          .length,
        1,
      );
      assert.equal(
        !!view.container.querySelector("#inquiry-date"),
        !savedStartsAt,
      );
      assert.equal(
        !!view.container.querySelector("#inquiry-time"),
        !savedStartsAt,
      );
      assert.equal(
        view.container.querySelector("#inquiry-expectedGuests"),
        null,
      );
      if (savedStartsAt) assert.match(view.container.textContent!, /18:30/);
      await submit(view.container);
      await until(() => assert.equal(next?.time, "18:30"));
      await click(view.container, "예상 인원 변경");
      await fill(view.container, "expectedGuests", "25");
      await submit(view.container);
      await until(() => assert.equal(next?.expectedGuests, "25"));
    } finally {
      await view.unmount();
    }
  }
});

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
      assert(view.container.querySelector('[role="alert"]')?.textContent),
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
    assert.equal(view.container.querySelector('select[name="groupId"]'), null);
    assert.match(view.container.textContent!, /모임 확인/);
    await fill(view.container, "name", " 새 행사 ");
    await chooseDate(view.container, "date", "2026-11-14");
    await chooseTime(view.container, "time", "18:30");
    await submit(view.container);
    assert.equal(typeof body, "undefined");
    await act(async () => {
      groups.resolve([{ id: event.groupId, name: "내 모임" }]);
    });
    await until(() => assert.match(view.container.textContent!, /내 모임/));
    await submit(view.container);
    await until(() => assert.deepEqual(view.navigations, ["/events?event=e1"]));
    assert.match(
      (body as { creationKey: string }).creationKey,
      /^[0-9a-f-]{36}$/,
    );
    assert.deepEqual(body, {
      creationKey: (body as { creationKey: string }).creationKey,
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
      assert(
        view.container
          .querySelector("button")
          ?.textContent?.includes("로그아웃"),
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
    await until(() =>
      assert(view.container.querySelector('a[href^="/auth?next="]')),
    );
    assert.equal(logoutCalls, 2);
  } finally {
    await view.unmount();
    globalThis.fetch = original;
  }
});

test("the home group stays fixed through failed or missing reads and recovery preserves event input", async () => {
  const groupId = "00000000-0000-4000-8000-000000000001";
  const groups = [{ id: groupId, name: "홈에서 고른 모임" }];
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
    return { id: "e1", groupId } as T;
  };
  const view = await render(
    createElement(EventForm, { accountId: "a", groupId, request }),
  );
  try {
    await until(() =>
      assert.match(view.container.textContent!, /홈에서 고른 모임/),
    );
    assert.equal(view.container.querySelector('select[name="groupId"]'), null);
    await fill(view.container, "name", "작성하던 행사");
    for (const failure of [true, false]) {
      failed = failure;
      result = [];
      await act(async () => {
        await view.cache.refetchQueries({ queryKey: ["user", "a", "groups"] });
      });
      await until(() => assert(view.container.querySelector('[role="alert"]')));
      assert.equal(
        view.container.querySelector<HTMLInputElement>('input[name="name"]')!
          .value,
        "작성하던 행사",
      );
      assert(
        view.container.querySelector<HTMLButtonElement>(
          'button[type="submit"]',
        )!.disabled,
      );
      await submit(view.container);
      assert.deepEqual(writes, []);
    }
    result = groups;
    await act(async () => {
      await view.cache.refetchQueries({ queryKey: ["user", "a", "groups"] });
    });
    await until(() =>
      assert(
        !view.container.querySelector<HTMLButtonElement>(
          'button[type="submit"]',
        )!.disabled,
      ),
    );
    await submit(view.container);
    await until(() =>
      assert.deepEqual(writes, [
        {
          name: "작성하던 행사",
          groupId,
          creationKey: (writes[0] as { creationKey: string }).creationKey,
        },
      ]),
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
    const { creationKey, ...body } = JSON.parse(String(options.body));
    assert.match(creationKey, /^[0-9a-f-]{36}$/);
    assert.deepEqual(body, { name: "개인 일정" });
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
    assert.equal(view.container.querySelector('select[name="groupId"]'), null);
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
        assert(document.querySelector('dialog a[href="/restaurants"]'));
        assert.equal(
          document.activeElement,
          document.querySelector("dialog h2"),
        );
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
    assert.deepEqual(
      body.consents.map((term: { id: string }) => term.id),
      ["serviceTerms", "privacyCollection", "marketing"],
    );
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
    for (const name of ["serviceTerms", "privacyCollection"]) {
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
    await click(view.container, "이메일 인증하기");
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
    await until(() => assert(view.container.querySelector("dialog[open]")));
    assert.match(
      view.container.querySelector('a[href^="sms:"]')!.getAttribute("href")!,
      /body=/,
    );
    assert(
      view.container.querySelector('img[alt="휴대폰 문자 앱을 여는 QR 코드"]'),
    );
    noSecrets();
    await click(view.container, "닫기");
    await click(view.container, "인증 다시 열기");
    assert.equal(issued, 2);
    await click(view.container, "문자 보냈어요");
    await until(() => assert.equal(checks, 1));
    await submit(view.container);
    assert.equal(joined, 0);
    await click(view.container, "문자 보냈어요");
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
      term.id === "privacyPolicy" ? { ...term, version: "new-policy" } : term,
    );
    await act(async () => {
      await view.cache.invalidateQueries({ queryKey: ["signup", "terms"] });
    });
    assert.deepEqual(values(), before);
    assert.doesNotMatch(view.container.textContent!, /약관이 변경되었어요/);
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
        'input[name="privacyCollection"]',
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

test("fresh and legacy organizers go straight to nickname setup and preserve next without creating a group", async () => {
  const original = globalThis.fetch;
  try {
    for (const scenario of [
      "new-organizer",
      "legacy-untyped",
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
            : scenario === "legacy-untyped"
              ? (null as string | null)
              : "organizer",
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
        await until(() =>
          assert(view.container.querySelector('input[name="nickname"]')),
        );
        assert.equal(
          view.container.querySelector('input[name="accountType"]'),
          null,
        );
        assert.doesNotMatch(view.container.textContent!, /사장님이에요/);
        await fill(view.container, "nickname", "우리 총무");
        await submit(view.container);
        await until(() =>
          assert(view.container.querySelector('input[name="usage"]')),
        );
        assert.deepEqual(writes, [
          { accountType: "organizer", nickname: "우리 총무" },
        ]);
        assert.equal(account.nickname, "우리 총무");
        await click(view.container, "나중에 선택하기");
        assert.deepEqual(view.navigations, ["/mypage"]);
      } finally {
        await view.unmount();
      }
    }
  } finally {
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
    assert.deepEqual(
      body.consents.map(
        ({ id, accepted }: { id: string; accepted: boolean }) => [id, accepted],
      ),
      [
        ["serviceTerms", true],
        ["privacyCollection", true],
        ["marketing", false],
      ],
    );
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
    for (const name of ["serviceTerms", "privacyCollection"])
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
    await click(view.container, "이메일 인증하기");
    assert.equal(emailRequests, 1);
    await fill(view.container, "email", account.email);
    await fill(view.container, "name", account.name);
    await fill(view.container, "phone", proof.phone);
    await click(view.container, "휴대폰 인증 요청");
    await until(() => assert(view.container.querySelector("dialog[open]")));
    await click(view.container, "문자 보냈어요");
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
          if (url.endsWith("/events")) {
            return Response.json([
              {
                id: "personal",
                groupId: null,
                name: "친구들과 송년 모임",
                scheduledAt: null,
              },
              {
                id: "group-event",
                groupId: "second",
                name: "기존 모임의 행사",
                scheduledAt: null,
              },
            ]);
          }
          return Response.json([]);
        }
        throw new Error("unexpected path");
      };
      const cache = client();
      const view = await render(
        createElement(
          HomeEntryProvider,
          null,
          createElement(AuthProvider, null, createElement(HomeScreen)),
        ),
        cache,
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
        assert(
          !view.container.querySelector(
            'a[href^="/events"]:not([href*="view=records"])',
          ),
        );
        const recordsLink = view.container.querySelector(
          'a[href*="view=records"]',
        );
        if (recordsLink)
          assert.equal(
            recordsLink.getAttribute("href"),
            `/events?view=records&group=${scenario === "inaccessible" ? "missing" : "second"}`,
          );
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
            view.container.querySelector(
              'nav a[href="/mypage?view=roster&group=second"]',
            ),
          );
          assert.equal(
            [...view.container.querySelectorAll("a")]
              .find((a) => a.textContent?.includes("새 행사"))
              ?.getAttribute("href"),
            "/events?group=second",
          );
        } else if (scenario === "empty") {
          await until(() =>
            assert(
              view.container.querySelector('a[href="/events?scope=personal"]'),
            ),
          );
        } else {
          await until(() =>
            assert(view.container.querySelector('[role="alert"]')),
          );
          assert(
            !view.container.querySelector(
              'a[href^="/events"]:not([href*="view=records"])',
            ),
          );
          const recordsLink = view.container.querySelector(
            'a[href*="view=records"]',
          );
          if (recordsLink)
            assert.equal(
              recordsLink.getAttribute("href"),
              `/events?view=records&group=${scenario === "inaccessible" ? "missing" : "second"}`,
            );
          assert.equal(eventReads, 0);
          if (scenario === "failed")
            assert(
              view.container.querySelector(
                'nav a[aria-current="page"][href="/?group=second"]',
              ),
            );
        }
        assert.doesNotMatch(
          view.container.textContent!,
          /개인 행사 보기|개인 행사 접기/,
        );
        if (scenario === "empty") {
          await until(() =>
            assert.match(view.container.textContent!, /친구들과 송년 모임/),
          );
          assert.doesNotMatch(view.container.textContent!, /기존 모임의 행사/);
        }
        const switcher = view.container.querySelector<HTMLButtonElement>(
          'header button[aria-label="모임·행사 선택"]',
        )!;
        assert.equal(switcher.getAttribute("aria-expanded"), "false");
        const beforeSwitch = eventReads;
        await act(async () => switcher.click());
        const dialog =
          view.container.querySelector<HTMLDialogElement>("dialog[open]")!;
        assert(dialog);
        await until(() =>
          assert.match(dialog.textContent!, /친구들과 송년 모임/),
        );
        assert.equal(eventReads, beforeSwitch + (scenario === "empty" ? 0 : 1));
        assert.doesNotMatch(dialog.textContent!, /기존 모임의 행사/);
        assert(dialog.querySelector('a[href="/events?event=personal"]'));
        assert(dialog.querySelector('a[href="/groups/new"]'));
        const personal = dialog.querySelector<HTMLAnchorElement>(
          'a[href="/?view=personal"]',
        )!;
        assert(personal);
        personal.addEventListener("click", (event) => event.preventDefault(), {
          once: true,
        });
        await act(async () => personal.click());
        assert(!view.container.querySelector("dialog[open]"));
        if (scenario === "selected") {
          await act(async () => switcher.click());
          const groupLink = view.container.querySelector<HTMLAnchorElement>(
            'dialog a[href="/?group=first"]',
          )!;
          assert(groupLink);
          groupLink.addEventListener(
            "click",
            (event) => event.preventDefault(),
            { once: true },
          );
          await act(async () => groupLink.click());
          assert(!view.container.querySelector("dialog[open]"));
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
