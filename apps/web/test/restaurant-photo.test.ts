import "./support/dom";
import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { RestaurantPhoto } from "../features/restaurants/components/restaurant-photo";
test("missing and failed restaurant photos use the same placeholder and a new source can recover", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(createElement(RestaurantPhoto, { src: null, alt: "공간" })),
    );
    assert.match(container.textContent!, /등록된 사진이 없어요/);
    await act(async () =>
      root.render(
        createElement(RestaurantPhoto, { src: "/missing.png", alt: "공간" }),
      ),
    );
    assert(container.querySelector("img"));
    await act(async () =>
      container.querySelector("img")!.dispatchEvent(new window.Event("error")),
    );
    assert.match(container.textContent!, /등록된 사진이 없어요/);
    await act(async () =>
      root.render(
        createElement(RestaurantPhoto, {
          src: "/images/restaurants/demo-1.png",
          alt: "공간",
        }),
      ),
    );
    assert(container.querySelector("img"));
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
