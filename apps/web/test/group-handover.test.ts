import "./support/dom";
import { createElement } from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { render, until, click, fill } from "./support/form-dom";
import { GroupManagement } from "../features/handovers/components/group-management";
import { EditMember } from "../features/groups/components/edit-member";
import { ApiError } from "../shared/http/api-error";
import type { SessionRequest } from "../features/auth/types";
test("pilot group management keeps the roster and existing handover cancellation without exposing invitations or new transfers", async () => {
  const accountId = crypto.randomUUID();
  const groupId = crypto.randomUUID();
  const pendingId = crypto.randomUUID();
  const writes: { path: string; body: unknown }[] = [];
  let status = "PENDING";
  const request: SessionRequest = async <T>(
    path: string,
    options?: RequestInit,
  ) => {
    if (options?.method === "POST") {
      writes.push({ path, body: JSON.parse(String(options.body)) });
      if (writes.length === 1) throw new ApiError("", 0, "NETWORK_ERROR");
      status = "CANCELLED";
      return { id: pendingId, status } as T;
    }
    return (
      path.endsWith("/accounts")
        ? {
            version: 1,
            ownerId: accountId,
            accounts: [
              {
                id: accountId,
                name: "기존 총무",
                email: "a@example.test",
                role: "ADMIN",
              },
            ],
          }
        : {
            group: { id: groupId, name: "합성 모임", version: 1 },
            scope: {
              roster: 2,
              events: 3,
              settlements: 1,
              files: 4,
              favorites: 1,
              ongoingInquiries: 0,
              ongoingReservations: 1,
              incompleteSettlements: 1,
            },
            requests: [
              { id: pendingId, status, expiresAt: "2099-01-01T00:00:00Z" },
            ],
          }
    ) as T;
  };
  const view = await render(
    createElement(GroupManagement, { accountId, groupId, request }),
  );
  try {
    await until(() =>
      assert.match(view.container.textContent!, /대기 중인 인수인계/),
    );
    assert.match(view.container.textContent!, /총무 인수인계준비 중/);
    assert.match(view.container.textContent!, /기본 명단2명/);
    assert.match(view.container.textContent!, /기존 총무/);
    assert.doesNotMatch(view.container.textContent!, /초대|인수인계 요청하기/);
    assert.equal(view.container.querySelector("#new-manager"), null);
    await click(view.container, "인수인계 요청 취소");
    await until(() =>
      assert.match(view.container.textContent!, /원래 요청 그대로/),
    );
    await click(view.container, "다시 시도");
    await until(() =>
      assert.doesNotMatch(view.container.textContent!, /대기 중인 인수인계/),
    );
    assert.deepEqual(writes, [
      {
        path: `/api/v1/handovers/groups/${groupId}/${pendingId}/cancel`,
        body: {},
      },
      {
        path: `/api/v1/handovers/groups/${groupId}/${pendingId}/cancel`,
        body: {},
      },
    ]);
  } finally {
    await view.unmount();
  }
});
test("roster edit explains exclusion, preserves inputs on conflict and retries an uncertain request exactly", async () => {
  const member = {
    id: crypto.randomUUID(),
    version: 1,
    name: "원래 이름",
    phoneLast4: "0012",
    label: null,
  };
  const writes: object[] = [];
  let closes = 0;
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    if (!options?.method)
      return {
        count: 0,
        attendedEventCount: 0,
        contributionTotal: 0,
        events: [],
      } as T;
    writes.push(JSON.parse(String(options?.body)));
    if (writes.length === 1) throw new ApiError("", 0, "NETWORK_ERROR");
    return { ok: true } as T;
  };
  const v = await render(
    createElement(EditMember, {
      accountId: crypto.randomUUID(),
      member,
      groupId: crypto.randomUUID(),
      request,
      refresh: () => {},
      onClose: () => closes++,
    }),
  );
  try {
    await fill(v.container, "name", "바꾼 이름");
    assert(
      v.container.querySelector('button[aria-label="기본 명단에서 제외"]'),
    );
    await click(v.container, "변경사항 저장");
    await until(() =>
      assert.match(v.container.textContent!, /응답을 확인하지 못했어요/),
    );
    assert.equal(
      v.container.querySelector<HTMLInputElement>("[name=name]")?.value,
      "바꾼 이름",
    );
    await click(v.container, "같은 요청 다시 확인");
    await until(() => assert.equal(closes, 1));
    assert.deepEqual(writes[0], writes[1]);
  } finally {
    await v.unmount();
  }
});

test("pilot retains cancellation of an existing handover without enabling a new request", async () => {
  let pending = true;
  const writes: string[] = [];
  const request: SessionRequest = async <T>(
    path: string,
    options?: RequestInit,
  ) => {
    if (options?.method === "POST") {
      writes.push(path);
      pending = false;
      return { id: "existing", status: "CANCELLED" } as T;
    }
    return (
      path.endsWith("/accounts")
        ? { version: 1, ownerId: "owner", accounts: [], invitations: [] }
        : {
            group: { id: "group", name: "QA 모임", version: 1 },
            scope: {
              roster: 1,
              events: 1,
              settlements: 1,
              files: 1,
              favorites: 0,
              ongoingInquiries: 0,
              ongoingReservations: 0,
              incompleteSettlements: 0,
            },
            requests: [
              {
                id: "existing",
                status: pending ? "PENDING" : "CANCELLED",
                targetId: "target",
                expiresAt: "2099-01-01T00:00:00Z",
                completedAt: null,
              },
            ],
          }
    ) as T;
  };
  const view = await render(
    createElement(GroupManagement, {
      accountId: "owner",
      groupId: "group",
      request,
    }),
  );
  try {
    await until(() =>
      assert.match(view.container.textContent!, /인수인계 요청 취소/),
    );
    assert.equal(view.container.querySelector("#new-manager"), null);
    assert.doesNotMatch(view.container.textContent!, /인수인계 요청하기/);
    await click(view.container, "인수인계 요청 취소");
    await until(() =>
      assert.doesNotMatch(view.container.textContent!, /인수인계 요청 취소/),
    );
    assert.deepEqual(writes, [
      "/api/v1/handovers/groups/group/existing/cancel",
    ]);
    assert.match(view.container.textContent!, /준비 중/);
    assert.equal(view.container.querySelector("#new-manager"), null);
  } finally {
    await view.unmount();
  }
});
