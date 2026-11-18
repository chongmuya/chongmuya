import "./support/dom";
import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Restaurant } from "../features/restaurants/types/restaurant.types";
import { RestaurantMap } from "../features/restaurants/components/restaurant-map";

test("the map uses coordinates, cleans up after auth failure and shows addresses when the focus has no coordinates", async () => {
  const previousKey = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID = "map-regression-test";
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  const originalFrame = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => {
    frames.set(++frameId, callback);
    return frameId;
  };
  globalThis.cancelAnimationFrame = (id) => {
    frames.delete(id);
  };
  let created = 0;
  let destroyed = 0;
  window.naver = {
    maps: {
      Map: class {
        constructor() {
          created++;
        }
        destroy() {
          destroyed++;
        }
        fitBounds() {}
        getCenter() {
          return { lat: () => 37.5, lng: () => 127.1 };
        }
        getZoom() {
          return 15;
        }
        setCenter() {}
      },
      LatLng: class {},
      Marker: class {
        setMap() {}
      },
    },
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        createElement(RestaurantMap, {
          restaurants: [
            {
              id: "known",
              name: "지도 매장",
              address: "지도 주소",
              latitude: 37.5,
              longitude: 127.1,
            } as Restaurant,
          ],
          onOpen() {},
        }),
      ),
    );
    const script = document.querySelector('script[src*="map-regression-test"]');
    assert(script, "the map SDK must be requested");
    await act(async () => script.dispatchEvent(new window.Event("load")));
    await act(async () => {
      for (const [id, callback] of frames) {
        frames.delete(id);
        callback(0);
      }
    });
    assert.equal(created, 1);
    await act(async () =>
      root.render(
        createElement(RestaurantMap, {
          restaurants: [
            {
              id: "known",
              name: "새 마커 이름",
              address: "주소",
              region: "지역",
              latitude: 37.5,
              longitude: 127.1,
            },
          ],
          onOpen() {},
        }),
      ),
    );
    assert.equal(
      created,
      1,
      "refetches update markers without recreating the map",
    );
    assert.equal(destroyed, 0);
    await act(async () => window.navermap_authFailure?.());
    assert.match(container.textContent!, /지도를 표시할 수 없어요/);
    assert.equal(destroyed, 1);
    await act(async () =>
      root.render(
        createElement(RestaurantMap, {
          restaurants: [
            {
              id: "missing",
              name: "좌표 없는 매장",
              address: "주소만 확인",
              latitude: null,
              longitude: null,
            } as Restaurant,
            {
              id: "other",
              name: "다른 매장",
              address: "다른 주소",
              latitude: 37.5,
              longitude: 127.1,
            } as Restaurant,
          ],
          focusId: "missing",
          onOpen() {},
        }),
      ),
    );
    assert.match(container.textContent!, /지도 위치 정보가 없습니다/);
    assert.match(container.textContent!, /좌표 없는 매장/);
    assert.doesNotMatch(container.textContent!, /다른 매장/);
    assert.equal(created, 1);
    await act(async () =>
      root.render(
        createElement(RestaurantMap, { restaurants: [], onOpen() {} }),
      ),
    );
    assert.match(container.textContent!, /표시할 매장이 없어요/);
    delete process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
    await act(async () =>
      root.render(
        createElement(RestaurantMap, {
          key: "without-key",
          restaurants: [
            {
              id: "address-only",
              name: "키 없이 확인할 매장",
              address: "주소 대체 화면",
              latitude: 37.5,
              longitude: 127.1,
            } as Restaurant,
          ],
          onOpen() {},
        }),
      ),
    );
    assert.match(container.textContent!, /지도를 표시할 수 없어요/);
    assert.match(container.textContent!, /주소 대체 화면/);
    assert.equal(created, 1);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    document.querySelector('script[src*="map-regression-test"]')?.remove();
    delete window.naver;
    globalThis.requestAnimationFrame = originalFrame;
    globalThis.cancelAnimationFrame = originalCancel;
    if (previousKey === undefined)
      delete process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
    else process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID = previousKey;
  }
});
