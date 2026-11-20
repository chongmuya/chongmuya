import "./support/dom";
import { act, createElement } from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { client, render, deferred, click } from "./support/form-dom";
import { HomeEntryProvider } from "../features/home/components/home-entry-provider";
import { HomeScreen } from "../features/home/components/home-screen";
import { AuthProvider } from "../features/auth/components/auth-provider";

const splash = 'main[aria-label="총무야 시작 중"]';
const anonymousSession = () =>
  Response.json({ authenticated: false, account: null });

function renderHome(next = "") {
  return render(
    createElement(
      PathnameContext.Provider,
      { value: "/" },
      createElement(
        HomeEntryProvider,
        null,
        createElement(AuthProvider, null, createElement(HomeScreen)),
      ),
    ),
    client(),
    next,
  );
}

test("a fast anonymous restore keeps the initial splash for a second and opens the intro with next", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const original = globalThis.fetch;
  const restore = deferred<Response>();
  const next = "/events?view=attendance";
  const reads: string[] = [];
  globalThis.fetch = async (input) => {
    reads.push(String(input));
    return restore.promise;
  };
  const view = await renderHome(next);
  try {
    assert(view.container.querySelector(splash));
    assert.equal(reads.length, 1);
    assert.match(reads[0]!, /\/auth\/session\/restore$/);
    await act(async () => restore.resolve(anonymousSession()));
    await act(async () => t.mock.timers.tick(999));
    assert(view.container.querySelector(splash));
    assert.deepEqual(view.navigations, []);
    await act(async () => t.mock.timers.tick(1));
    assert.deepEqual(view.navigations, [
      `/intro?next=${encodeURIComponent(next)}`,
    ]);
    assert.doesNotMatch(view.container.textContent!, /처음 가입해요/);
  } finally {
    restore.resolve(anonymousSession());
    await view.unmount();
    globalThis.fetch = original;
  }
});

test("the initial splash waits for a slow restore and a failed restore keeps session recovery", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const original = globalThis.fetch;
  const restore = deferred<Response>();
  let attempts = 0;
  globalThis.fetch = async () =>
    ++attempts === 1 ? restore.promise : anonymousSession();
  const view = await renderHome("/");
  try {
    await act(async () => t.mock.timers.tick(1500));
    assert(view.container.querySelector(splash));
    assert.deepEqual(view.navigations, []);
    await act(async () => restore.resolve(new Response(null, { status: 503 })));
    assert.equal(view.container.querySelector(splash), null);
    assert.match(view.container.textContent!, /연결 재확인/);
    assert.deepEqual(view.navigations, []);
    await click(view.container, "연결 재확인");
    assert.deepEqual(view.navigations, ["/intro?next=%2F"]);
  } finally {
    restore.resolve(anonymousSession());
    await view.unmount();
    globalThis.fetch = original;
  }
});

test("root keeps the splash before sending owners and unfinished accounts to their own entry", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const original = globalThis.fetch;
  try {
    for (const [accountType, destination] of [
      ["owner", "/owner"],
      [null, "/getting-started?next=%2F"],
    ] as const) {
      const reads: string[] = [];
      globalThis.fetch = async (input) => {
        reads.push(String(input));
        return Response.json({
          authenticated: true,
          account: {
            id: "entry-user",
            email: "entry@example.test",
            accountType,
            nickname: null,
            name: "이름",
          },
        });
      };
      const view = await renderHome();
      try {
        assert(view.container.querySelector(splash));
        assert.deepEqual(view.navigations, []);
        await act(async () => t.mock.timers.tick(1000));
        assert.deepEqual(view.navigations, [destination]);
        assert.equal(
          reads.filter(
            (path) => path.endsWith("/groups") || path.endsWith("/events"),
          ).length,
          0,
        );
        assert.doesNotMatch(
          view.container.textContent!,
          /모임 만들기|받은 문의/,
        );
      } finally {
        await view.unmount();
      }
    }
  } finally {
    globalThis.fetch = original;
  }
});
