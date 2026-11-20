import "./support/dom";
import { act, createElement } from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { client, render, until, deferred, click } from "./support/form-dom";
import { HomeScreen } from "../features/home/components/home-screen";
import { AuthProvider } from "../features/auth/components/auth-provider";

test("root restores behind the splash then offers the design entry and explicit public browsing", async () => {
  const original = globalThis.fetch;
  const restore = deferred<Response>();
  globalThis.fetch = async () => restore.promise;
  const view = await render(
    createElement(AuthProvider, null, createElement(HomeScreen)),
    client(),
  );
  try {
    assert(view.container.querySelector('main[aria-label="총무야 시작 중"]'));
    assert.equal(view.container.querySelector('a[href="/events"]'), null);
    await act(async () =>
      restore.resolve(Response.json({ authenticated: false, account: null })),
    );
    await until(() =>
      assert.match(view.container.textContent!, /처음 가입해요/),
    );
    assert.doesNotMatch(
      view.container.textContent!,
      /첫 행사를 준비|내 행사와 명단/,
    );
    assert(view.container.querySelector('a[href^="/intro?next="]'));
    await click(view.container, "회원가입 없이 사용해볼래요");
    assert(view.container.querySelector('dialog a[href="/restaurants"]'));
  } finally {
    restore.resolve(Response.json({ authenticated: false, account: null }));
    await view.unmount();
    globalThis.fetch = original;
  }
});

test("root sends owners and unfinished accounts to their own entry instead of a second dashboard", async () => {
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
      const view = await render(
        createElement(AuthProvider, null, createElement(HomeScreen)),
        client(),
      );
      try {
        await until(() => assert.deepEqual(view.navigations, [destination]));
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
