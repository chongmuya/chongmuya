import "./support/dom";
import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement } from "react";
import { AuthProvider } from "../features/auth/components/auth-provider";
import { RestaurantBrowser } from "../features/restaurants/components/restaurant-browser";
import { RestaurantDetail } from "../features/restaurants/components/restaurant-detail";
import { restaurantQuery } from "../features/restaurants/api/restaurants.api";
import { render, until, click, deferred } from "./support/form-dom";

const restaurant = {
  id: "restaurant",
  name: "검수 매장",
  address: "가상 주소",
  maxCapacity: 20,
  category: "한식",
  operatingHours: null,
  facilities: null,
  photoPath: null,
  spacePhotos: [],
  bookingPolicy: "하루 전 문의 권장",
  spaces: [
    {
      id: "hall",
      label: "일반 홀",
      kind: "HALL",
      availability: "AVAILABLE",
      togetherSeating: "YES",
      capacity: 20,
      minGuests: 0,
      minSpend: 0,
      separateFee: 0,
      conditions: null,
    },
  ],
  menus: [],
  inquiryAvailable: true,
};

test("detail sheets show restaurant data and retain their contents on refetch failure", async () => {
  const original = globalThis.fetch;
  let failed = false;
  let available = true;
  let removed = 0;
  let inquiries = 0;
  let reads = 0;
  let pending: ReturnType<typeof deferred<Response>> | undefined;
  globalThis.fetch = async (input) => {
    if (!String(input).includes("/restaurants/"))
      return Response.json({ authenticated: false, account: null });
    reads++;
    if (pending) return pending.promise;
    return failed
      ? Response.json({}, { status: 503 })
      : Response.json({ ...restaurant, inquiryAvailable: available });
  };
  const view = await render(
    createElement(
      AuthProvider,
      null,
      createElement(RestaurantDetail, {
        id: restaurant.id,
        selected: true,
        full: false,
        selectionBlocked: false,
        opensInquirySheet: false,
        targetCount: 1,
        onSelect: () => {
          removed++;
        },
        onInquiry: () => {
          inquiries++;
        },
        onMap() {},
      }),
    ),
  );
  try {
    await until(() => assert.match(view.container.textContent!, /검수 매장/));
    assert.equal(view.container.querySelector("dialog"), null);
    assert.match(view.container.textContent!, /예시 이미지/);
    const closeSheet = async () => {
      const close = view.container.querySelector<HTMLButtonElement>(
        'dialog[open] button[aria-label="닫기"]',
      )!;
      await act(async () => close.click());
      assert.equal(view.container.querySelector("dialog"), null);
    };
    await click(view.container, "예약 정보");
    assert.match(
      view.container.querySelector("dialog[open]")?.textContent ?? "",
      /하루 전 문의 권장/,
    );
    await closeSheet();
    await click(view.container, "공간 정보");
    assert.match(
      view.container.querySelector("dialog[open]")?.textContent ?? "",
      /공간별 이용조건.*일반 홀.*최대 20명/,
    );
    await closeSheet();
    await click(view.container, "메뉴판");
    failed = true;
    await act(async () => {
      await view.cache.refetchQueries({
        queryKey: restaurantQuery(restaurant.id).queryKey,
      });
    });
    await until(() =>
      assert.match(
        view.container.querySelector('[role="alert"]')?.textContent ?? "",
        /최신 매장 정보를/,
      ),
    );
    assert.match(
      view.container.querySelector("dialog[open]")?.textContent ?? "",
      /메뉴 정보 확인이 필요/,
    );
    await closeSheet();
    assert.equal(document.activeElement?.textContent, "메뉴판");
    assert.equal(
      view.container.querySelectorAll("#restaurant-detail-title").length,
      1,
    );
    const proceed = [...view.container.querySelectorAll("button")].find(
      (b) => b.textContent === "선택한 1곳으로 계속",
    )!;
    assert.equal(proceed.disabled, true);
    await act(async () => proceed.click());
    assert.equal(inquiries, 0);
    pending = deferred<Response>();
    const retry = [...view.container.querySelectorAll("button")].find(
      (b) => b.textContent === "다시 시도",
    )!;
    const readsBeforeRetry = reads;
    await act(async () => {
      retry.focus();
      retry.click();
      retry.click();
    });
    assert.equal(reads, readsBeforeRetry + 1);
    assert.equal(document.activeElement, retry);
    await until(() =>
      assert.equal(retry.getAttribute("aria-disabled"), "true"),
    );
    await act(async () => {
      pending!.resolve(
        Response.json({ ...restaurant, inquiryAvailable: true }),
      );
      pending = undefined;
      failed = false;
    });
    await until(() => assert.equal(proceed.disabled, false));
    assert.equal(
      document.activeElement,
      view.container.querySelector("#restaurant-detail-title"),
    );
    assert.equal(removed, 0);
    available = false;
    await act(async () => {
      await view.cache.refetchQueries({
        queryKey: restaurantQuery(restaurant.id).queryKey,
      });
    });
    await until(() =>
      assert.match(
        view.container.textContent!,
        /현재는 문의를 접수할 수 없어요/,
      ),
    );
    assert.equal(
      [...view.container.querySelectorAll("button")].some((b) =>
        b.textContent?.includes("곳으로 계속"),
      ),
      false,
    );
    const deselect = [...view.container.querySelectorAll("button")].find(
      (b) => b.textContent === "문의 담기 취소",
    )!;
    await act(async () => {
      deselect.focus();
      deselect.click();
    });
    assert.equal(removed, 1);
    assert.match(
      document.activeElement?.textContent ?? "",
      /현재는 문의를 접수할 수 없어요/,
    );
  } finally {
    await view.unmount();
    globalThis.fetch = original;
  }
});

test("detail cannot continue while another selected restaurant is unverified", async () => {
  const original = globalThis.fetch;
  const firstRead = deferred<Response>();
  const other = { ...restaurant, id: "other", name: "다른 매장" };
  let otherResponse = () => firstRead.promise;
  let inquiries = 0;
  let remaining: string[] | undefined;
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/restaurants/other")) return otherResponse();
    if (path.endsWith("/restaurants/restaurant"))
      return Response.json(restaurant);
    return Response.json({ authenticated: false, account: null });
  };
  const view = await render(
    createElement(
      AuthProvider,
      null,
      createElement(RestaurantBrowser, {
        selected: [restaurant.id, other.id],
        restaurantId: restaurant.id,
        view: "detail",
        page: 1,
        onSelect(ids) {
          remaining = ids;
        },
        onNavigate() {},
        onInquiry() {
          inquiries++;
        },
      }),
    ),
  );
  const otherQuery = restaurantQuery(other.id).queryKey;
  try {
    await until(() => assert.match(view.container.textContent!, /검수 매장/));
    const proceed = [...view.container.querySelectorAll("button")].find(
      (b) => b.textContent === "선택한 2곳으로 계속",
    )!;
    assert.equal(proceed.disabled, true);

    await act(async () =>
      firstRead.resolve(Response.json({}, { status: 503 })),
    );
    await until(() =>
      assert.equal(view.cache.getQueryState(otherQuery)?.status, "error"),
    );
    assert.equal(proceed.disabled, true);

    for (const inquiryAvailable of [false, true]) {
      otherResponse = async () => Response.json({ ...other, inquiryAvailable });
      await act(async () => {
        await view.cache.refetchQueries({ queryKey: otherQuery });
      });
      await until(() => assert.equal(proceed.disabled, !inquiryAvailable));
      await act(async () => proceed.click());
      assert.equal(inquiries, inquiryAvailable ? 1 : 0);
    }

    const recheck = deferred<Response>();
    otherResponse = () => recheck.promise;
    await act(async () => {
      void view.cache.refetchQueries({ queryKey: otherQuery });
    });
    await until(() => assert.equal(proceed.disabled, true));
    assert.equal(view.cache.getQueryState(otherQuery)?.status, "success");
    assert.equal(view.cache.getQueryState(otherQuery)?.fetchStatus, "fetching");
    await act(async () => proceed.click());
    assert.equal(inquiries, 1);
    await click(view.container, "문의 담기 취소");
    assert.deepEqual(remaining, [other.id]);

    await act(async () => recheck.resolve(Response.json(other)));
    await until(() => assert.equal(proceed.disabled, false));
    await act(async () => proceed.click());
    assert.equal(inquiries, 2);
  } finally {
    await view.unmount();
    globalThis.fetch = original;
  }
});
