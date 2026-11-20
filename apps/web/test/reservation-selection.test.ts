import "./support/dom";
import { act, createElement } from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { render, until, click } from "./support/form-dom";
import { ReservationProgress } from "../features/reservations/components/reservation-progress";
import type { ReservationRequest } from "../features/reservations/types/inquiry.types";
import type { SessionRequest } from "../features/auth/types";
import { ApiError } from "../shared/http/api-error";
import { onlineManager } from "@tanstack/react-query";

function fixture(): ReservationRequest {
  const snapshot = {
    eventName: "선택 테스트",
    groupName: null,
    groupType: null,
    startsAt: "2099-12-01T09:00:00.000Z",
    expectedGuests: 20,
    region: "건대입구",
    seating: "ANY" as const,
    space: "ANY" as const,
    seatingImportance: null,
    spaceImportance: null,
    budgetBasis: null,
    budgetAmount: null,
    alcohol: null,
    additionalRequests: null,
  };
  return {
    id: crypto.randomUUID(),
    eventId: crypto.randomUUID(),
    createdAt: "2026-11-19T00:00:00.000Z",
    status: "RECEIVED",
    round: 1,
    version: 2,
    lifecycle: "ACTIVE",
    canReinquire: false,
    responseCount: 1,
    snapshot,
    contact: {
      name: "총무",
      maskedPhone: "010-****-1234",
      phoneVerifiedAt: null,
    },
    targets: [
      {
        id: crypto.randomUUID(),
        restaurantId: crypto.randomUUID(),
        restaurantName: "제안 매장",
        address: "서울",
        isDemo: true,
        deliveryStatus: "ACCEPTED",
        candidateState: "PROPOSED",
        canSelect: true,
        response: {
          kind: "AVAILABLE",
          revision: 1,
          snapshot: {
            ...snapshot,
            requested: snapshot,
            offered: {
              ...snapshot,
              minimumSpend: null,
              separateFee: null,
              deposit: { kind: "NONE", amount: 0 },
              menuDeadlineAt: null,
              note: "과거 조건",
            },
          },
          reason: "",
          createdAt: "2026-11-19T00:00:00.000Z",
          expiresAt: "2099-11-30T00:00:00.000Z",
          state: "PROPOSED",
        },
      },
    ],
  };
}
function selected(q: ReservationRequest): ReservationRequest {
  const t = q.targets[0];
  return {
    ...q,
    lifecycle: "SELECTED",
    version: q.version! + 1,
    selection: {
      id: crypto.randomUUID(),
      targetId: t.id,
      revision: 1,
      version: 1,
      status: "PREPARING",
      snapshot: {
        requested: q.snapshot,
        offered: t.response!.snapshot.offered!,
      },
      selectedAt: new Date().toISOString(),
    },
    targets: [{ ...t, canSelect: false, candidateState: "SELECTED" }],
  };
}

test("selection retries keep the seen revision and key; refresh shows the saved preparation state", async () => {
  let q = fixture();
  const writes: Record<string, unknown>[] = [];
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    if (_path.startsWith("/api/v1/reservations/"))
      throw new ApiError("", 503, "DATABASE_UNAVAILABLE");
    if (options?.method === "POST") {
      writes.push(JSON.parse(String(options.body)));
      if (writes.length === 1)
        throw new ApiError("offline", 0, "NETWORK_ERROR");
      q = selected(q);
      return q as T;
    }
    return { request: structuredClone(q) } as T;
  };
  const view = await render(
    createElement(ReservationProgress, {
      accountId: "a",
      eventId: q.eventId,
      request,
    }),
  );
  try {
    await until(() => assert.match(view.container.textContent!, /제안 매장/));
    await click(view.container, "수락");
    q = { ...q, version: 3 };
    await act(async () => {
      await view.cache.refetchQueries();
    });
    onlineManager.setOnline(false);
    await click(view.container, "이 매장 선택");
    await until(() => assert.equal(writes.length, 1));
    await until(() =>
      assert(
        !view.container.querySelector<HTMLButtonElement>(
          'button[aria-busy="true"]',
        ),
      ),
    );
    onlineManager.setOnline(true);
    assert.equal(
      writes.length,
      1,
      "reconnect must not replay a manual decision",
    );
    await click(view.container, "이 매장 선택");
    await until(() =>
      assert.match(view.container.textContent!, /매장 선택 당시 응답/),
    );
    assert.deepEqual(writes[1], writes[0]);
    assert.equal(writes[0].expectedVersion, 2);
    assert.equal(writes[0].revision, 1);
    assert.match(view.container.textContent!, /선택 당시 조건을 보존한 이력/);
  } finally {
    onlineManager.setOnline(true);
    await view.unmount();
  }
});

test("conflicting selection renders the actual winner and permission loss hides past private details", async () => {
  let q = fixture(),
    denied = false;
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    if (options?.method === "POST") {
      q = selected({
        ...q,
        targets: [
          { ...q.targets[0], restaurantName: "다른 탭에서 선택한 매장" },
        ],
      });
      throw new ApiError("ignored", 409, "RESERVATION_SELECTION_CONFLICT");
    }
    if (denied) throw new ApiError("ignored", 404, "NOT_FOUND");
    if (_path.startsWith("/api/v1/reservations/"))
      throw new ApiError("", 503, "DATABASE_UNAVAILABLE");
    return { request: structuredClone(q) } as T;
  };
  const view = await render(
    createElement(ReservationProgress, {
      accountId: "a",
      eventId: q.eventId,
      request,
    }),
  );
  try {
    await until(() => assert.match(view.container.textContent!, /제안 매장/));
    await click(view.container, "수락");
    await click(view.container, "이 매장 선택");
    await until(() =>
      assert.match(view.container.textContent!, /다른 탭에서 선택한 매장/),
    );
    assert.equal(view.container.querySelector("dialog"), null);
    assert.match(view.container.textContent!, /다른 화면|변경|최신/);
    denied = true;
    await act(async () => {
      await view.cache.refetchQueries();
    });
    await until(() =>
      assert.doesNotMatch(
        view.container.textContent!,
        /다른 탭에서 선택한 매장|010-/,
      ),
    );
  } finally {
    await view.unmount();
  }
});

test("late selection response after leaving or switching accounts cannot restore former account cache", async () => {
  const q = fixture();
  let resolve!: (v: ReservationRequest) => void;
  const pending = new Promise<ReservationRequest>((r) => {
    resolve = r;
  });
  let started = false;
  const request: SessionRequest = async <T>(
    _path: string,
    options?: RequestInit,
  ) => {
    if (options?.method === "POST") {
      started = true;
      return (await pending) as T;
    }
    return { request: q } as T;
  };
  const view = await render(
    createElement(ReservationProgress, {
      accountId: "a",
      eventId: q.eventId,
      request,
    }),
  );
  await until(() => assert.match(view.container.textContent!, /제안 매장/));
  await click(view.container, "수락");
  await click(view.container, "이 매장 선택");
  await until(() => assert(started));
  await view.unmount();
  view.cache.clear();
  await act(async () => {
    resolve(selected(q));
    await pending;
  });
  assert.equal(view.cache.getQueryCache().getAll().length, 0);
});
