import "./support/dom";
import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement } from "react";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { ReservationProgress } from "../features/reservations/components/reservation-progress";
import { render, until, fill } from "./support/form-dom";
import type { Completion } from "../features/reservation-completion/types/completion.types";
import type { SessionRequest } from "../features/auth/types";
import { ApiError } from "../shared/http/api-error";

test("actual reservation detail polls independently, preserves dirty versions, pauses hidden/offline and blocks lost access", async (t) => {
  const intervals = new Set<() => void>();
  const original = globalThis.setInterval;
  const clear = globalThis.clearInterval;
  const handles = new Map<ReturnType<typeof setInterval>, () => void>();
  t.after(() => {
    for (const handle of handles.keys()) clear(handle);
  });
  t.mock.method(
    globalThis,
    "setInterval",
    (callback: () => void, ms: number) => {
      const handle = original(() => {}, 3600_000);
      handles.set(handle, callback);
      if (ms === 15000) intervals.add(callback);
      return handle;
    },
  );
  t.mock.method(
    globalThis,
    "clearInterval",
    (handle: ReturnType<typeof setInterval>) => {
      const callback = handles.get(handle);
      if (callback) intervals.delete(callback);
      handles.delete(handle);
      clear(handle);
    },
  );
  let state = {
    id: "reservation",
    eventId: "event",
    restaurantName: "가상 매장",
    version: 1,
    status: "PREPARING",
    progress: "PAYMENT_CHECKING",
    agreement: {
      startsAt: "2026-12-05T09:00:00Z",
      expectedGuests: 10,
      minimumSpend: null,
      separateFee: null,
      minimumQuantity: null,
      menuDeadlineAt: null,
    },
    guidance: {
      kind: "REQUIRED",
      amount: 1000,
      revision: 1,
      channel: "SMS",
      deadline: "2026-12-01T00:00:00Z",
      policy: "전화 문의",
    },
    order: { total: 2000, lines: [], revision: 1 },
    acknowledgedRevision: 1,
    confirmation: null,
    cancellation: null,
    catalog: { version: 1, menus: [] },
    issues: [],
    changes: [],
    history: [],
    notifications: [],
    receivedAmount: 0,
    refundedAmount: 0,
  } as unknown as Completion;
  let reads = 0,
    fail: "temporary" | "access" | null = null;
  const request: SessionRequest = async <T>(path: string) => {
    if (path.includes("/reservation-requests"))
      return {
        request: {
          contact: { name: "가상 총무", maskedPhone: "테스트" },
          currentContact: { name: "가상 총무", maskedPhone: "테스트" },
          id: "inquiry",
          eventId: "event",
          lifecycle: "SELECTED",
          version: 1,
          targets: [],
          snapshot: {
            eventName: "가상 행사",
            startsAt: state.agreement.startsAt,
            expectedGuests: 10,
            budgetBasis: "PER_PERSON",
            budgetAmount: null,
            region: "건대입구",
            seating: "ANY",
            space: "ANY",
            alcohol: "UNKNOWN",
          },
          selection: { id: "reservation", targetId: "target", snapshot: {} },
        },
      } as T;
    reads++;
    if (fail === "temporary") throw new TypeError("temporary");
    if (fail === "access")
      throw new ApiError("", 403, "RESERVATION_ACCESS_INVALID");
    return structuredClone(state) as T;
  };
  focusManager.setFocused(false);
  onlineManager.setOnline(true);
  const view = await render(
    createElement(ReservationProgress, {
      accountId: "poll-account",
      eventId: "event",
      request,
    }),
  );
  const tick = async () => {
    await act(async () => {
      for (const callback of [...intervals]) callback();
    });
  };
  try {
    assert.equal(reads, 0);
    await act(async () => {
      await act(async () => {
        focusManager.setFocused(true);
      });
    });
    await until(() =>
      assert.match(view.container.textContent!, /매장 확인을 기다리고/),
    );
    await fill(view.container, "payer", "작성 중인 총무");
    await fill(view.container, "amount", "1200");
    state = {
      ...state,
      version: 2,
      status: "CONFIRMED",
      progress: "CONFIRMED",
      confirmation: {
        at: "2026-11-20T00:00:00Z",
        audit: {
          kind: "OWNER",
          confirmer: "가상 사장",
          method: "WEB",
          confirmedAt: "2026-11-20T00:00:00Z",
        },
      },
      receivedAmount: 1000,
    } as Completion;
    await tick();
    await until(() =>
      assert.match(view.container.textContent!, /예약이 확정됐어요/),
    );
    await tick();
    assert.equal(
      view.container.querySelector<HTMLInputElement>('[name="payer"]')?.value,
      "작성 중인 총무",
    );
    assert.equal(
      view.container.querySelector<HTMLInputElement>('[name="amount"]')?.value,
      "1200",
    );
    assert.match(view.container.textContent!, /최신|바뀌/);
    await act(async () => {
      focusManager.setFocused(false);
    });
    const before = reads;
    await tick();
    assert.equal(reads, before);
    await act(async () => {
      focusManager.setFocused(true);
    });
    await until(() => assert(reads > before));
    await act(async () => {
      onlineManager.setOnline(false);
    });
    const offline = reads;
    await tick();
    assert.equal(reads, offline);
    await act(async () => {
      onlineManager.setOnline(true);
    });
    await until(() => assert(reads > offline));
    fail = "temporary";
    await tick();
    await until(() =>
      assert.match(view.container.textContent!, /최신 내용을 확인하지 못/),
    );
    assert.equal(
      view.container.querySelector<HTMLInputElement>('[name="payer"]')?.value,
      "작성 중인 총무",
    );
    fail = "access";
    await tick();
    await until(() => assert.match(view.container.textContent!, /권한이 만료/));
    assert.equal(view.container.querySelector('[name="payer"]'), null);
    await until(() =>
      assert.equal(
        view.cache.getQueriesData({
          queryKey: ["user", "poll-account", "reservation-completion"],
        }).length,
        0,
      ),
    );
    const denied = reads;
    await tick();
    assert.equal(reads, denied);
  } finally {
    await view.unmount();
    focusManager.setFocused(undefined);
    await act(async () => {
      onlineManager.setOnline(true);
    });
  }
  const after = reads;
  await tick();
  assert.equal(reads, after);
});

test("capability expiry unmounts its observer, aborts in-flight work and cannot revive private data", async (t) => {
  const { CompletionWorkspace } =
    await import("../features/reservation-completion/components/completion-workspace");
  const originalTimeout = globalThis.setTimeout;
  let expiration: (() => void) | undefined;
  let expiryHandle: ReturnType<typeof setTimeout> | undefined;
  t.mock.method(
    globalThis,
    "setTimeout",
    (callback: () => void, ms?: number, ...args: unknown[]) => {
      if (ms && ms > 900 && ms <= 1100) {
        expiration = callback;
        expiryHandle = originalTimeout(() => {}, 3600000);
        return expiryHandle;
      }
      return originalTimeout(callback, ms, ...args);
    },
  );
  t.after(() => {
    if (expiryHandle) clearTimeout(expiryHandle);
  });
  let signal: AbortSignal | undefined;
  let resolveFetch: ((response: Response) => void) | undefined;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, options?: RequestInit) => {
      signal = options?.signal ?? undefined;
      return new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
    },
  );
  const access = {
    kind: "link" as const,
    scope: "test-expiry",
    access: "fake-test-token",
    accessExpiresAt: new Date(Date.now() + 1000).toISOString(),
  };
  focusManager.setFocused(true);
  const view = await render(
    createElement(CompletionWorkspace, { id: "expiry-reservation", access }),
  );
  try {
    await until(() => assert(resolveFetch && expiration));
    await act(async () => {
      expiration!();
    });
    await until(() => assert.match(view.container.textContent!, /권한이 만료/));
    assert(signal?.aborted);
    await act(async () => {
      resolveFetch!(
        new Response(JSON.stringify({ privateSentinel: "must-not-return" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    assert.doesNotMatch(view.container.textContent!, /must-not-return/);
    assert.equal(
      view.cache.getQueriesData({
        queryKey: ["reservation-management", access.scope],
      }).length,
      0,
    );
  } finally {
    await view.unmount();
    focusManager.setFocused(undefined);
  }
});
