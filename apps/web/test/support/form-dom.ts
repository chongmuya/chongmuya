import "./dom";
import assert from "node:assert/strict";
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  SearchParamsContext,
  PathnameContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
export function client() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
}
export async function render(
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
export async function until(check: () => void) {
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
export async function fill(
  container: HTMLElement,
  name: string,
  value: string,
) {
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
export async function submit(container: HTMLElement) {
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(
        new window.Event("submit", { bubbles: true, cancelable: true }),
      );
  });
}
export async function click(container: HTMLElement, text: string) {
  const button = [...container.querySelectorAll("button")].find(
    (item) => item.textContent === text,
  );
  assert(button, text);
  await act(async () => button.click());
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
