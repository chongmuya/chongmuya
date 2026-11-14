import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { WorkspaceContent } from "../app/workspace-screen";

const router = {
  bfcacheId: "test",
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch: async () => {},
  hmrRefresh() {},
};
const request = async <T>(): Promise<T> => {
  throw new Error("render must not issue requests");
};
function render(
  cache: QueryClient,
  groupId: string | null,
  accountId = "a",
  eventId: string | null = null,
  mode: "events" | "mypage" = "events",
) {
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: router },
      createElement(
        QueryClientProvider,
        { client: cache },
        createElement(WorkspaceContent, {
          accountId,
          request,
          groupId,
          eventId,
          mode,
        }),
      ),
    ),
  );
}
function fixture() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  cache.setQueryData(
    ["user", "a", "groups"],
    [
      { id: "g1", name: "첫 모임" },
      { id: "g2", name: "둘째 모임" },
    ],
  );
  cache.setQueryData(
    ["user", "a", "groups", "g1", "events"],
    [
      {
        id: "e1",
        groupId: "g1",
        name: "첫 모임 비공개 행사",
        scheduledAt: null,
      },
    ],
  );
  cache.setQueryData(["user", "a", "groups", "g2", "events"], []);
  cache.setQueryData(["user", "b", "groups"], []);
  return cache;
}
test("accounts without groups can view personal events and create one without onboarding", () => {
  const cache = fixture();
  cache.setQueryData(["user", "b", "events", "list"], []);
  const html = render(cache, null, "b");
  assert.match(html, /행사 만들기|개인 행사/);
  assert.match(html, /아직 행사가 없어요/);
  assert.doesNotMatch(html, /첫 모임을 만들어|첫 모임 비공개 행사/);
  cache.setQueryData(["user", "b", "events", "detail", "e2"], {
    id: "e2",
    ownerId: "b",
    groupId: null,
    version: 1,
    name: "개인 일정",
    scheduledAt: null,
  });
  assert.match(render(cache, "unused-group", "b", "e2"), /개인 일정/);
  assert.doesNotMatch(render(cache, null, "a", "e2"), /개인 일정/);
  cache.clear();
});
test("switching groups and accounts never renders another scope's cached events", () => {
  const cache = fixture();
  assert.match(render(cache, "g1"), /첫 모임 비공개 행사/);
  assert.doesNotMatch(render(cache, "g2"), /첫 모임 비공개 행사/);
  assert.match(render(cache, "g2"), /아직 행사가 없어요/);
  assert.doesNotMatch(render(cache, "g1", "b"), /첫 모임 비공개 행사/);
  assert.match(
    render(cache, "foreign", "a", null, "mypage"),
    /접근할 수 없는 모임/,
  );
  const page = render(cache, "g1", "a", null, "mypage");
  assert.match(page, /모임 추가/);
  assert.match(page, /모임 이름 수정/);
  assert.match(page, /mypage\?group=g2/);
  cache.clear();
});
test("query failure hides cached events and offers retry; recovery restores list", async () => {
  const cache = fixture();
  const key = ["user", "a", "groups", "g1", "events"];
  await assert.rejects(
    cache.fetchQuery({
      queryKey: key,
      queryFn: async () => {
        throw new Error("offline");
      },
    }),
  );
  const failed = render(cache, "g1");
  assert.match(failed, /다시 시도/);
  assert.doesNotMatch(failed, /첫 모임 비공개 행사/);
  await cache.fetchQuery({ queryKey: key, queryFn: async () => [] });
  assert.match(render(cache, "g1"), /아직 행사가 없어요/);
  cache.clear();
});
