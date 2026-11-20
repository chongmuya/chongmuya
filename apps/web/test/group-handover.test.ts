import "./support/dom";
import { act, createElement } from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { render, until, click, fill } from "./support/form-dom";
import { GroupManagement } from "../features/handovers/components/group-management";
import { EditMember } from "../features/groups/components/edit-member";
import { ApiError } from "../shared/http/api-error";
import type { SessionRequest } from "../features/auth/types";
import { handoverKey } from "../features/handovers/api/handovers.api";
test("lost handover creation preserves original token, version and request key after background authority refetch", async () => {
  const accountId = crypto.randomUUID(),
    groupId = crypto.randomUUID(),
    targetId = crypto.randomUUID(),
    id = crypto.randomUUID();
  const writes: Record<string, unknown>[] = [];
  const preview = {
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
    requests: [],
  };
  const request: SessionRequest = async <T>(
    path: string,
    options?: RequestInit,
  ) => {
    if (options?.method === "POST") {
      writes.push(JSON.parse(String(options.body)));
      if (writes.length === 1) throw new ApiError("", 0, "NETWORK_ERROR");
      return {
        id,
        status: "PENDING",
        completedAt: null,
        expiresAt: "2099-01-01T00:00:00Z",
      } as T;
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
              {
                id: targetId,
                name: "새 총무",
                email: "b@example.test",
                role: "MEMBER",
              },
            ],
            invitations: [],
          }
        : preview
    ) as T;
  };
  const v = await render(
    createElement(GroupManagement, { accountId, groupId, request }),
  );
  try {
    await until(() => assert(v.container.querySelector("#new-manager")));
    await act(async () => {
      const select =
        v.container.querySelector<HTMLSelectElement>("#new-manager")!;
      select.value = targetId;
      select.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    await click(v.container, "인수인계 요청하기");
    await until(() =>
      assert.match(v.container.textContent!, /원래 요청 그대로/),
    );
    await act(async () =>
      v.cache.setQueryData(handoverKey(accountId, groupId), {
        ...preview,
        group: { ...preview.group, version: 2 },
      }),
    );
    await click(v.container, "다시 시도");
    await until(() => assert.equal(writes.length, 2));
    assert.deepEqual(writes[0], writes[1]);
    assert.equal(writes[1].expectedVersion, 1);
    await until(() =>
      assert(
        v.container
          .querySelector<HTMLInputElement>('[aria-label="공유할 링크"]')
          ?.value.endsWith(`#${writes[0].token}`),
      ),
    );
    assert.match(v.container.textContent!, /자동 발송하지 않았어요/);
  } finally {
    await v.unmount();
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
    writes.push(JSON.parse(String(options?.body)));
    if (writes.length === 1) throw new ApiError("", 0, "NETWORK_ERROR");
    return { ok: true } as T;
  };
  const v = await render(
    createElement(EditMember, {
      member,
      groupId: crypto.randomUUID(),
      request,
      refresh: () => {},
      onClose: () => closes++,
    }),
  );
  try {
    await fill(v.container, "name", "바꾼 이름");
    await click(v.container, "변경 저장");
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
    assert.match(v.container.textContent!, /과거 행사 기록 보존/);
  } finally {
    await v.unmount();
  }
});

test("pending invitations identify masked recipients and cancel only the selected invitation", async () => {
  const accountId = crypto.randomUUID(),
    groupId = crypto.randomUUID();
  const first = crypto.randomUUID(),
    second = crypto.randomUUID();
  const writes: string[] = [];
  const request: SessionRequest = async <T>(
    path: string,
    options?: RequestInit,
  ) => {
    if (options?.method === "POST") {
      writes.push(path);
      return { id: second, status: "CANCELLED" } as T;
    }
    return (
      path.endsWith("/accounts")
        ? {
            version: 1,
            ownerId: accountId,
            accounts: [],
            invitations: [
              {
                id: first,
                status: "PENDING",
                targetLabel: "aa***@example.test",
                expiresAt: "2099-01-01T00:00:00Z",
              },
              {
                id: second,
                status: "PENDING",
                targetLabel: "bb***@example.test",
                expiresAt: "2099-01-02T00:00:00Z",
              },
            ],
          }
        : {
            group: { id: groupId, name: "모임", version: 1 },
            requests: [],
            scope: {
              events: 0,
              roster: 0,
              settlements: 0,
              files: 0,
              favorites: 0,
              ongoingInquiries: 0,
              ongoingReservations: 0,
              incompleteSettlements: 0,
            },
          }
    ) as T;
  };
  const ui = await render(
    createElement(GroupManagement, { accountId, groupId, request }),
  );
  try {
    await until(() =>
      assert(
        ui.container.textContent!.includes("bb***@example.test 초대 취소"),
      ),
    );
    assert(ui.container.textContent!.includes("2099"));
    await click(ui.container, "bb***@example.test 초대 취소");
    await until(() => assert.equal(writes.length, 1));
    assert.equal(
      writes[0],
      `/api/v1/groups/${groupId}/invitations/${second}/cancel`,
    );
  } finally {
    await ui.unmount();
  }
});
