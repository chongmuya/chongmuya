import "./support/dom";
import { act, createElement } from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { render, until, fill, click, deferred } from "./support/form-dom";
import { GroupRoster } from "../features/groups/components/group-roster";
import { ImportGroupRoster } from "../features/attendance/components/import-group-roster";
import { groupKeys } from "../features/groups/api/groups.queries";
import type { GroupMember, MemberHistory } from "../features/groups/types";
import type { SessionRequest } from "../features/auth/types";
import { ApiError } from "../shared/http/api-error";
const member = (
  name: string,
  phoneLast4: string,
  label: string | null = null,
): GroupMember => ({
  id: crypto.randomUUID(),
  version: 1,
  name,
  phoneLast4,
  label,
});

test("roster search keeps total count and opens exact member history without merging names; history pages preserve edited fields and full totals", async () => {
  const accountId = crypto.randomUUID(),
    groupId = crypto.randomUUID();
  const members = [
    member("김민지", "0012", "운영"),
    member("김민지", "3412", "개발"),
    member("홍길동", "9999"),
  ];
  const reads: string[] = [];
  const request: SessionRequest = async <T>(path: string) => {
    reads.push(path);
    if (path.includes("/history")) {
      assert(path.includes(members[1].id));
      return {
        count: 21,
        attendedEventCount: 7,
        contributionTotal: 99000,
        events: [
          {
            eventId: crypto.randomUUID(),
            name: path.includes("offset=20")
              ? "이전 연결 행사"
              : "최근 연결 행사",
            startsAt: null,
            attending: false,
            contributionAmount: 1000,
            settlementStatus: "IN_PROGRESS",
          },
        ],
      } as MemberHistory as T;
    }
    return members as T;
  };
  const v = await render(
    createElement(GroupRoster, { accountId, groupId, request }),
  );
  try {
    await until(() => assert.match(v.container.textContent!, /전체 3명/));
    await fill(v.container, "memberSearch", "김민지");
    assert.match(v.container.textContent!, /전체 3명 · 검색 결과 2명/);
    assert.equal(v.container.querySelectorAll("ol li").length, 2);
    await fill(v.container, "memberSearch", "3412");
    assert.match(v.container.textContent!, /검색 결과 1명/);
    await act(async () =>
      v.container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="김민지 수정·이력"]',
        )!
        .click(),
    );
    await until(() => assert.match(v.container.textContent!, /최근 연결 행사/));
    assert.match(v.container.textContent!, /99,000/);
    assert(
      v.container.querySelector('a[aria-label*="참석으로 집계된 차수 없음"]'),
    );
    await fill(v.container, "name", "작성 중 이름");
    await click(v.container, "다음");
    await until(() => assert.match(v.container.textContent!, /이전 연결 행사/));
    assert.equal(
      v.container.querySelector<HTMLInputElement>('input[name="name"]')!.value,
      "작성 중 이름",
    );
    assert.match(v.container.textContent!, /99,000/);
    assert(reads.some((path) => path.endsWith("history?offset=20")));
    await act(async () =>
      v.container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="명단으로 돌아가기"]',
        )!
        .click(),
    );
    await fill(v.container, "memberSearch", "없는 이름");
    assert.match(v.container.textContent!, /검색 결과가 없어요/);
    assert.doesNotMatch(v.container.textContent!, /아직 등록된 구성원/);
    await act(async () =>
      v.cache.setQueryData(groupKeys.members(accountId, groupId), []),
    );
    await until(() =>
      assert.match(v.container.textContent!, /아직 등록된 구성원이 없어요/),
    );
  } finally {
    await v.unmount();
  }
});

test("selected import only selects available search results, keeps hidden selections and retries original IDs and versions after a lost response", async () => {
  const accountId = crypto.randomUUID(),
    groupId = crypto.randomUUID(),
    eventId = crypto.randomUUID();
  let members = [
    member("가져온 사람", "0001"),
    member("동명이인", "1111", "첫째"),
    member("동명이인", "2222", "둘째"),
    member("다른 사람", "3333"),
  ];
  const original = structuredClone(members);
  const writes: {
    requestKey: string;
    members: { id: string; version: number }[];
  }[] = [];
  const imported: number[] = [];
  const request: SessionRequest = async <T>(
    path: string,
    options?: RequestInit,
  ) => {
    if (options?.method === "POST") {
      assert(path.endsWith("participants/import-group/selected"));
      writes.push(JSON.parse(String(options.body)));
      if (writes.length === 1) {
        members = members.map((row) => ({ ...row, version: 2 }));
        throw new ApiError("", 0, "NETWORK_ERROR");
      }
      return { addedCount: 2 } as T;
    }
    return structuredClone(members) as T;
  };
  const v = await render(
    createElement(ImportGroupRoster, {
      accountId,
      eventId,
      groupId,
      request,
      existing: [
        {
          id: crypto.randomUUID(),
          groupMemberId: members[0].id,
          name: members[0].name,
          phoneLast4: "0001",
          label: null,
          version: 1,
        },
        {
          id: crypto.randomUUID(),
          groupMemberId: null,
          name: "동명이인",
          phoneLast4: "1111",
          label: null,
          version: 1,
        },
      ],
      onClose() {},
      onImported: (count) => imported.push(count),
    }),
  );
  try {
    await until(() =>
      assert.equal(
        v.container.querySelectorAll('input[type="checkbox"]').length,
        4,
      ),
    );
    assert(
      v.container.querySelector<HTMLInputElement>(
        'input[aria-label="가져온 사람 0001 선택"]',
      )!.disabled,
    );
    assert(
      !v.container.querySelector<HTMLInputElement>(
        'input[aria-label="동명이인 1111 첫째 선택"]',
      )!.disabled,
    );
    await fill(v.container, "importSearch", "동명이인");
    await click(v.container, "전체 선택");
    assert.match(v.container.textContent!, /선택 2명/);
    await fill(v.container, "importSearch", "3333");
    assert.match(v.container.textContent!, /검색 결과 1명 · 선택 2명/);
    await click(v.container, "전체 선택");
    assert.match(v.container.textContent!, /선택 3명/);
    await click(v.container, "전체 선택 해제");
    assert.match(v.container.textContent!, /선택 2명/);
    await click(v.container, "참여자 추가하기");
    await until(() =>
      assert.match(v.container.textContent!, /같은 요청 다시 확인/),
    );
    await until(() =>
      assert.match(v.container.textContent!, /선택한 구성원 정보가 바뀌었거나/),
    );
    assert.equal(
      v.container.querySelector<HTMLInputElement>('input[name="importSearch"]')!
        .disabled,
      true,
    );
    assert.deepEqual(
      writes[0].members,
      original.slice(1, 3).map(({ id, version }) => ({ id, version })),
    );
    await click(v.container, "같은 요청 다시 확인");
    await until(() => assert.deepEqual(imported, [2]));
    assert.deepEqual(writes[1], writes[0]);
  } finally {
    await v.unmount();
  }
});

test("selected source changes require an explicit new selection and permission loss hides roster", async () => {
  const accountId = crypto.randomUUID(),
    groupId = crypto.randomUUID(),
    eventId = crypto.randomUUID();
  const members = [member("보호되는 이름", "4567")];
  let forbidden = false;
  const request: SessionRequest = async <T>() => {
    if (forbidden) throw new ApiError("", 404, "NOT_FOUND");
    return members as T;
  };
  const v = await render(
    createElement(ImportGroupRoster, {
      accountId,
      eventId,
      groupId,
      request,
      existing: [],
      onClose() {},
      onImported() {},
    }),
  );
  try {
    await until(() =>
      assert(v.container.querySelector('input[type="checkbox"]')),
    );
    await click(v.container, "전체 선택");
    await act(async () =>
      v.cache.setQueryData(groupKeys.members(accountId, groupId), [
        { ...members[0], version: 2 },
      ]),
    );
    await until(() =>
      assert.match(v.container.textContent!, /선택한 구성원 정보가 바뀌었거나/),
    );
    assert(
      v.container.querySelector<HTMLButtonElement>('button[type="submit"]')!
        .disabled,
    );
    await click(v.container, "최신 명단으로 다시 선택");
    assert.match(v.container.textContent!, /선택 0명/);
    forbidden = true;
    await act(async () => {
      await v.cache.invalidateQueries({
        queryKey: groupKeys.members(accountId, groupId),
      });
    });
    await until(() => assert.match(v.container.textContent!, /권한이 없어요/));
    assert.doesNotMatch(v.container.textContent!, /보호되는 이름/);
  } finally {
    await v.unmount();
  }
});

test("roster screen keeps one navigation in empty, missing, loading and error states", async () => {
  const { WorkspaceContent } = await import("../app/workspace-screen");
  for (const state of [
    "empty",
    "missing",
    "error",
    "loading",
    "ready",
  ] as const) {
    const accountId = crypto.randomUUID(),
      groupId = crypto.randomUUID();
    const request: SessionRequest = async <T>(path: string) => {
      if (state === "loading") return new Promise<T>(() => {});
      if (state === "error") throw new ApiError("", 0, "NETWORK_ERROR");
      if (path === "/api/v1/groups")
        return (
          state === "ready"
            ? [{ id: groupId, name: "모임", groupType: null, memberCount: 0 }]
            : []
        ) as T;
      if (path.endsWith("/members")) return [] as T;
      return { unread: 0, count: 0 } as T;
    };
    const v = await render(
      createElement(WorkspaceContent, {
        accountId,
        request,
        mode: "mypage",
        view: "roster",
        groupId: state === "empty" ? null : groupId,
        eventId: null,
      }),
    );
    try {
      const expected = {
        empty: /아직 모임이 없습니다/,
        missing: /접근할 수 없는 모임/,
        error: /다시 시도/,
        loading: /모임 확인 중/,
        ready: /아직 등록된 구성원/,
      }[state];
      await until(() => assert.match(v.container.textContent!, expected));
      assert.equal(
        v.container.querySelectorAll('nav[aria-label="주요 메뉴"]').length,
        1,
      );
      const home = [
        ...v.container.querySelectorAll('nav[aria-label="주요 메뉴"] a'),
      ].find((link) => link.textContent === "홈");
      assert(home);
      assert.equal(
        home.getAttribute("href"),
        state === "ready" ? `/?group=${groupId}` : "/?view=personal",
      );
    } finally {
      await v.unmount();
    }
  }
});

test("leaving an import in flight prevents late completion from restoring cache or navigating", async () => {
  const accountId = crypto.randomUUID(),
    groupId = crypto.randomUUID(),
    eventId = crypto.randomUUID();
  const pending = deferred<{ addedCount: number }>();
  let writing = false,
    completed = false,
    imported = false;
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    if (options?.method === "POST") {
      writing = true;
      const result = await pending.promise;
      completed = true;
      return result as T;
    }
    return [member("늦은 응답 검증", "1234")] as T;
  };
  const v = await render(
    createElement(ImportGroupRoster, {
      accountId,
      groupId,
      eventId,
      request,
      existing: [],
      onClose() {},
      onImported() {
        imported = true;
      },
    }),
  );
  await until(() =>
    assert(v.container.querySelector('input[type="checkbox"]')),
  );
  await click(v.container, "전체 선택");
  await click(v.container, "참여자 추가하기");
  await until(() => assert(writing));
  await v.unmount();
  await act(async () => {
    pending.resolve({ addedCount: 1 });
    await pending.promise;
  });
  await until(() => assert(completed));
  assert.equal(imported, false);
  assert.equal(v.cache.getQueryCache().getAll().length, 0);
});
