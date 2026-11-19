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
    assert(container.querySelector('[role="img"][aria-label="사진 없음"]'));
    assert.match(container.querySelector("img")!.src, /menu\.svg/);
    await act(async () =>
      root.render(
        createElement(RestaurantPhoto, { src: "/missing.png", alt: "공간" }),
      ),
    );
    assert(container.querySelector("img"));
    await act(async () =>
      container.querySelector("img")!.dispatchEvent(new window.Event("error")),
    );
    assert.match(container.querySelector("img")!.src, /menu\.svg/);
    assert(container.querySelector('[role="img"][aria-label="사진 없음"]'));
    await act(async () =>
      root.render(
        createElement(RestaurantPhoto, {
          src: "/images/restaurants/demo-1.png",
          alt: "공간",
        }),
      ),
    );
    assert.match(
      container.querySelector("img")!.getAttribute("src")!,
      /demo-1\.png/,
    );
    assert.equal(container.querySelector("img")!.alt, "공간");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
