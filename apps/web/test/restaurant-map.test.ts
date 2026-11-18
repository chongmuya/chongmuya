import "./support/dom";
import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { RestaurantMap } from "../features/restaurants/components/restaurant-map";

test("the map initializes with no restaurant coordinates and cleans up after authorization failure", async () => {
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
          restaurants: [],
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
    assert.equal(created, 1, "an empty catalog must still show a map");
    await act(async () => window.navermap_authFailure?.());
    assert.match(container.textContent!, /지도를 표시할 수 없어요/);
    assert.equal(destroyed, 1);
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
