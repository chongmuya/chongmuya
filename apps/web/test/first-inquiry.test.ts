import "./support/dom";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { act, createElement, useSyncExternalStore } from "react";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { AuthProvider } from "../features/auth/components/auth-provider";
import { ReservationExplorer } from "../features/reservations/components/reservation-explorer";
import { restaurantQuery } from "../features/restaurants/api/restaurants.api";
import type {
  CreateInquiry,
  ReservationRequest,
} from "../features/reservations/types/inquiry.types";
import {
  click,
  deferred,
  fill,
  render,
  submit,
  until,
} from "./support/form-dom";

const event = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "예약 테스트 행사",
  scheduledAt: "2099-11-24T10:00:45.000Z",
  version: 1,
};
const account = {
  id: "10000000-0000-4000-8000-000000000002",
  accountType: "organizer",
  name: "테스트 총무",
  nickname: "총무",
  phone: "01000000000",
};
const a = { id: "10000000-0000-4000-8000-000000000003", name: "온기식탁" };
const b = { id: "10000000-0000-4000-8000-000000000004", name: "동네부엌" };
const path = `/restaurants?event=${event.id}&inquiry=1`;
const restaurant = (store: typeof a, inquiryAvailable = true) => ({
  ...store,
  address: "가상 주소",
  maxCapacity: store.id === a.id ? 24 : 60,
  inquiryAvailable,
  spaces: [],
  spacePhotos: [],
  menus: [],
  isDemo: true,
});
const subscribe = (update: () => void) => {
  window.addEventListener("popstate", update);
  return () => window.removeEventListener("popstate", update);
};
const search = () => window.location.search;
function Explorer() {
  const params = useSyncExternalStore(subscribe, search);
  return createElement(
    SearchParamsContext.Provider,
    { value: new URLSearchParams(params) },
    createElement(AuthProvider, null, createElement(ReservationExplorer)),
  );
}
function button(container: ParentNode, name: string) {
  const result = [...container.querySelectorAll("button")].find(
    (item) =>
      item.textContent === name || item.getAttribute("aria-label") === name,
  );
  assert(result, name);
  return result;
}
function sheet(container: HTMLElement) {
  const result = container.querySelector("dialog[open]");
  assert(result instanceof HTMLElement);
  return result;
}

async function fixtureForTest(
  t: TestContext,
  initialView = "conditions",
  expectedGuests: number | null = 24,
) {
  for (const method of ["pushState", "replaceState"] as const) {
    const original = window.history[method].bind(window.history);
    t.mock.method(
      window.history,
      method,
      (data: unknown, unused: string, url?: string | URL | null) => {
        original(data, unused, url);
        // Next syncs native history updates with useSearchParams in the browser.
        window.dispatchEvent(
          new window.PopStateEvent("popstate", { state: window.history.state }),
        );
      },
    );
  }
  t.mock.method(window, "scrollTo", () => {});
  const animation = Object.getOwnPropertyDescriptor(
    globalThis,
    "requestAnimationFrame",
  );
  const cancel = Object.getOwnPropertyDescriptor(
    globalThis,
    "cancelAnimationFrame",
  );
  Reflect.set(
    globalThis,
    "requestAnimationFrame",
    window.setTimeout.bind(window),
  );
  Reflect.set(
    globalThis,
    "cancelAnimationFrame",
    window.clearTimeout.bind(window),
  );
  window.history.replaceState(null, "", `${path}&view=${initialView}`);
  const posts: CreateInquiry[] = [];
  const estimateUpdates: unknown[] = [];
  const fixture = {
    posts,
    estimateUpdates,
    event: { ...event, expectedGuests },
    receipt: null as ReservationRequest | null,
    readA: async () => Response.json(restaurant(a)),
    send: async (): Promise<Response> => {
      throw new TypeError("response lost");
    },
  };
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string, options?: RequestInit) => {
      const { pathname } = new URL(input);
      if (pathname.endsWith("/auth/session/restore"))
        return Response.json({ authenticated: true, account });
      if (pathname.endsWith("/reservation-requests")) {
        if (options?.method === "POST") {
          const body = JSON.parse(String(options.body)) as CreateInquiry;
          posts.push(body);
          return fixture.send();
        }
        return Response.json({ request: fixture.receipt });
      }
      if (pathname.endsWith(`/events/${event.id}`)) {
        if (options?.method === "PATCH") {
          const body = JSON.parse(String(options.body)) as {
            expectedGuests: number;
          };
          estimateUpdates.push(body);
          fixture.event = {
            ...fixture.event,
            expectedGuests: body.expectedGuests,
            version: fixture.event.version + 1,
          };
        }
        return Response.json(fixture.event);
      }
      if (pathname.endsWith(`/restaurants/${a.id}`)) return fixture.readA();
      if (pathname.endsWith(`/restaurants/${b.id}`))
        return Response.json(restaurant(b));
      if (pathname.endsWith("/restaurants"))
        return Response.json({
          items: [restaurant(a), restaurant(b)],
          total: 2,
          page: 1,
          pageSize: 10,
        });
      return Response.json([]);
    },
  );
  const view = await render(createElement(Explorer));
  t.after(async () => {
    await view.unmount();
    if (animation)
      Object.defineProperty(globalThis, "requestAnimationFrame", animation);
    else Reflect.deleteProperty(globalThis, "requestAnimationFrame");
    if (cancel)
      Object.defineProperty(globalThis, "cancelAnimationFrame", cancel);
    else Reflect.deleteProperty(globalThis, "cancelAnimationFrame");
  });
  if (initialView === "conditions") {
    await until(() => assert(view.container.querySelector("form")));
    if (expectedGuests === null) {
      assert.match(
        view.container.textContent!,
        /행사 예상 인원을 등록해 주세요/,
      );
      await fill(view.container, "expectedGuests", "24");
      await submit(view.container);
      await until(() =>
        assert.match(
          view.container.textContent!,
          /매장에 어떤 조건을 전달할까요/,
        ),
      );
    }
    assert.ok(!view.container.querySelector('[name="date"]'));
    assert.ok(!view.container.querySelector('[name="expectedGuests"]'));
    await submit(view.container);
  }
  await until(() => button(view.container, `${a.name} 상세 보기`));
  return { ...view, fixture };
}

test("the first inquiry uses one sheet from list and detail and validates all selected queries before sending", async (t) => {
  const { container, cache, fixture } = await fixtureForTest(t);
  await click(container, "문의 담기");
  await click(container, "문의 진행하기");
  assert.match(sheet(container).textContent!, /문의할 매장.*\/3/);
  assert.match(sheet(container).textContent!, /11\.24 \(.\) 19:00 · 24명/);
  assert.equal(fixture.posts.length, 0);
  await click(sheet(container), "닫기");
  await until(() => assert.ok(!container.querySelector("dialog")));
  assert.ok(
    document.activeElement === button(container, "문의 진행하기"),
    "focus returns to the list trigger",
  );
  await click(container, `${b.name} 상세 보기`);
  await until(() => button(container, "문의 진행하기"));

  const aQuery = restaurantQuery(a.id).queryKey;
  await until(() =>
    assert.equal(cache.getQueryState(aQuery)?.status, "success"),
  );
  const startRead = () => {
    const pending = deferred<Response>();
    fixture.readA = () => pending.promise;
    return pending;
  };
  const fresh = startRead();
  await act(async () => {
    void cache.refetchQueries({ queryKey: aQuery });
  });
  await click(container, "문의 진행하기");
  const dialog = sheet(container);
  const send = button(dialog, "2곳에 문의 보내기");
  assert.equal(send.disabled, true);
  assert.match(dialog.textContent!, /최신 매장 정보 확인 중/);
  await act(async () => send.click());
  assert.equal(fixture.posts.length, 0);
  await act(async () => fresh.resolve(Response.json(restaurant(a))));
  await until(() => assert.equal(send.disabled, false));

  const failure = startRead();
  await act(async () => {
    void cache.refetchQueries({ queryKey: aQuery });
  });
  await act(async () => failure.resolve(Response.json({}, { status: 503 })));
  await until(() => button(dialog, "다시 시도"));
  assert.equal(send.disabled, true);
  fixture.readA = async () => Response.json(restaurant(a, false));
  await click(dialog, "다시 시도");
  await until(() =>
    assert.match(dialog.textContent!, /현재 문의할 수 없는 매장/),
  );
  assert.equal(send.disabled, true);
  await click(dialog, `${a.name} 선택 해제`);
  const sendB = button(dialog, "1곳에 문의 보내기");
  const response = deferred<Response>();
  fixture.send = () => response.promise;
  await act(async () => {
    sendB.click();
    sendB.click();
  });
  await until(() => button(dialog, "문의 보내는 중…"));
  assert.equal(button(dialog, "닫기").disabled, true);
  assert.equal(button(dialog, `${b.name} 선택 해제`).disabled, true);
  assert.equal(fixture.posts.length, 1);
  assert.deepEqual(fixture.posts[0].restaurantIds, [b.id]);
  assert.equal(fixture.posts[0].conditions.startsAt, event.scheduledAt);
  assert.equal(
    Object.hasOwn(fixture.posts[0].conditions, "expectedGuests"),
    false,
  );
  assert.doesNotMatch(search(), /view=review/);
  await act(async () => response.resolve(Response.json({}, { status: 503 })));
  await until(() => assert.equal(sendB.disabled, false));
  await click(dialog, "1곳에 문의 보내기");
  await until(() => assert.equal(fixture.posts.length, 2));
  assert.equal(fixture.posts[0].requestKey, fixture.posts[1].requestKey);
});

test("reopening conditions preserves the stored estimate and shows a store capacity change", async (t) => {
  const { container, fixture, cache } = await fixtureForTest(t);
  await click(container, "문의 담기");
  await click(container, "문의 진행하기");
  await click(sheet(container), "닫기");
  await until(() => assert.ok(!container.querySelector("dialog")));
  await act(async () => window.history.back());
  await until(() =>
    assert.match(container.textContent!, /매장에 어떤 조건을 전달할까요/),
  );
  assert.doesNotMatch(container.textContent!, /예상 인원 변경/);
  assert.match(container.textContent!, /24명/);
  await submit(container);
  await until(() => button(container, "문의 진행하기"));
  fixture.readA = async () =>
    Response.json({ ...restaurant(a), maxCapacity: 23 });
  await act(async () => {
    await cache.refetchQueries({ queryKey: restaurantQuery(a.id).queryKey });
  });
  await click(container, "문의 진행하기");
  const dialog = sheet(container);
  await until(() => assert.match(dialog.textContent!, /최대 23명까지 가능/));
  assert.match(dialog.textContent!, /19:00 · 24명/);
  assert.equal(button(dialog, "1곳에 문의 보내기").disabled, true);
  await click(dialog, `${a.name} 선택 해제`);
  assert.match(dialog.textContent!, /선택한 매장이 없어요/);
  assert.equal(button(dialog, "0곳에 문의 보내기").disabled, true);
  assert.equal(fixture.posts.length, 0);
});

test("an older event registers its estimate once before inquiry conditions", async (t) => {
  const { fixture } = await fixtureForTest(t, "conditions", null);
  assert.deepEqual(fixture.estimateUpdates, [
    { expectedVersion: 1, expectedGuests: 24 },
  ]);
  assert.equal(fixture.posts.length, 0);
});

test("an old first-review link returns to the list and a changed event requires confirmation before sending again", async (t) => {
  const { container, fixture } = await fixtureForTest(t, "review");
  await click(container, "문의 담기");
  await act(async () => {
    window.history.pushState(null, "", `${path}&view=review&selected=${a.id}`);
  });
  await until(() =>
    assert.equal(new URLSearchParams(search()).get("view"), "list"),
  );
  assert.ok(!container.querySelector("dialog"));
  assert.equal(fixture.posts.length, 0);
  await click(container, "문의 진행하기");
  const dialog = sheet(container);
  fixture.send = async () => {
    fixture.event = {
      ...event,
      expectedGuests: 24,
      version: 2,
      name: "변경된 테스트 행사",
      scheduledAt: "2099-11-25T11:30:00.000Z",
    };
    return Response.json(
      {
        code: "VERSION_CONFLICT",
        statusCode: 409,
        requestId: event.id,
        message: "event version changed",
      },
      { status: 409 },
    );
  };
  const send = button(dialog, "1곳에 문의 보내기");
  await until(() => assert.equal(send.disabled, false));
  await click(dialog, "1곳에 문의 보내기");
  await until(() => button(dialog, "최신 행사 정보 확인"));
  assert.match(dialog.textContent!, /11\.25 \(.\) 20:30 · 24명/);
  assert.match(dialog.textContent!, /변경된 테스트 행사/);
  assert.equal(send.disabled, true);
  assert.equal(fixture.posts.length, 1);

  await click(dialog, "최신 행사 정보 확인");
  fixture.send = async () => {
    const [latest] = fixture.posts.slice(-1);
    fixture.receipt = {
      id: "10000000-0000-4000-8000-000000000005",
      eventId: event.id,
      createdAt: "2099-11-20T00:00:00.000Z",
      status: "RECEIVED",
      responseCount: 0,
      snapshot: {
        ...latest.conditions,
        expectedGuests: 24,
        eventName: fixture.event.name,
        groupName: null,
        groupType: null,
      },
      contact: {
        name: account.name,
        maskedPhone: "010****0000",
        phoneVerifiedAt: null,
      },
      targets: [],
    };
    throw new TypeError("response lost after acceptance");
  };
  await click(dialog, "1곳에 문의 보내기");
  await until(() => assert.match(container.textContent!, /문의 진행 상태/));
  assert.equal(fixture.posts.length, 2);
  assert.equal(fixture.posts[1].expectedEventVersion, 2);
  assert.equal(fixture.posts[1].conditions.startsAt, fixture.event.scheduledAt);
  assert.notEqual(fixture.posts[1].requestKey, fixture.posts[0].requestKey);
});
