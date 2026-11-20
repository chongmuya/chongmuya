import "./support/dom";
import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement } from "react";
import { AuthProvider } from "../features/auth/components/auth-provider";
import { RestaurantDetail } from "../features/restaurants/components/restaurant-detail";
import { restaurantQuery } from "../features/restaurants/api/restaurants.api";
import { render, until, click } from "./support/form-dom";

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
  spaces: [],
  menus: [],
  inquiryAvailable: true,
};

test("detail retains the active section on refetch failure, blocks inquiry and recovers without losing selection", async () => {
  const original = globalThis.fetch;
  let failed = false;
  let available = true;
  let removed = 0;
  let inquiries = 0;
  globalThis.fetch = async (input) =>
    String(input).includes("/restaurants/")
      ? failed
        ? Response.json({}, { status: 503 })
        : Response.json({ ...restaurant, inquiryAvailable: available })
      : Response.json({ authenticated: false, account: null });
  const view = await render(
    createElement(
      AuthProvider,
      null,
      createElement(RestaurantDetail, {
        id: restaurant.id,
        selected: true,
        full: false,
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
    assert.match(view.container.textContent!, /메뉴 정보 확인이 필요/);
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
    failed = false;
    await click(view.container, "다시 시도");
    await until(() => assert.equal(proceed.disabled, false));
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
    await click(view.container, "문의 담기 취소");
    assert.equal(removed, 1);
  } finally {
    await view.unmount();
    globalThis.fetch = original;
  }
});
